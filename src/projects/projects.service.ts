import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { CoolifyService } from '../coolify/coolify.service';
import { RedisService } from '../redis/redis.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly coolifyService: CoolifyService,
    private readonly redisService: RedisService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) { }

  /**
   * Registrar el sync automático con el intervalo configurado en env.
   * COOLIFY_SYNC_INTERVAL_MS: ms entre sync (default 300_000 = 5 min, mínimo 60s).
   * Si es 0, se desactiva.
   */
  onModuleInit() {
    const raw = process.env.COOLIFY_SYNC_INTERVAL_MS;
    const parsed = raw ? Number(raw) : 300_000;
    const intervalMs = Number.isFinite(parsed) ? parsed : 300_000;

    if (intervalMs <= 0) {
      this.logger.log('Auto-sync con Coolify desactivado (COOLIFY_SYNC_INTERVAL_MS=0)');
      return;
    }
    const safe = Math.max(60_000, intervalMs);
    this.logger.log(`Auto-sync con Coolify cada ${safe / 1000}s`);
    const interval = setInterval(() => this.handleAutoSync(), safe);
    this.schedulerRegistry.addInterval('coolify-auto-sync', interval);
  }

  async syncProjectsFromCoolify(): Promise<Project[]> {
    const apps = await this.coolifyService.getProjects();
    const projects: Project[] = [];

    for (const app of apps) {
      let project = await this.projectRepository.findOne({
        where: { coolifyAppId: app.uuid },
      });

      if (!project) {
        project = this.projectRepository.create({
          coolifyAppId: app.uuid,
          name: app.name,
          description: app.description || null,
          archivedAt: null,
        });
      } else {
        project.name = app.name;
        project.description = app.description || null;
        // Si reapareció en Coolify (admin lo desarchivó / lo recreó con la
        // misma uuid), lo desarchivamos para que vuelva al dashboard.
        if (project.archivedAt) project.archivedAt = null;
      }

      await this.projectRepository.save(project);
      projects.push(project);
    }

    // Soft-archive de huérfanos: marca cualquier proyecto de nuestra DB cuyo
    // coolifyAppId NO esté en la respuesta actual de Coolify. Guarda anti-bug:
    // si Coolify devolvió lista vacía (puede pasar por error transitorio o por
    // un token revocado), no archivamos nada para no vaciar el dashboard.
    if (apps.length > 0) {
      const liveUuids = apps.map((a) => a.uuid);
      const result = await this.projectRepository
        .createQueryBuilder()
        .update(Project)
        .set({ archivedAt: () => 'NOW()' })
        .where('coolifyAppId NOT IN (:...liveUuids)', { liveUuids })
        .andWhere('archivedAt IS NULL')
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`Archivados ${result.affected} proyectos huérfanos`);
      }
    } else {
      this.logger.warn('Coolify devolvió lista vacía: salteo el archive para evitar wipe');
    }

    // Limpiar cache después de sincronización
    await this.redisService.clearPattern('projects:*');
    this.logger.log('Cache de proyectos limpiado después de sync');

    return projects;
  }

  async handleAutoSync() {
    this.logger.log('Ejecutando sync automático con Coolify...');
    try {
      await this.syncProjectsFromCoolify();
      this.logger.log('Sync completado ✅');
    } catch (err: any) {
      this.logger.error(`Sync falló: ${err?.message || err}`);
    }
  }

  async findOne(id: string): Promise<Project> {
    const cacheKey = `project:${id}`;
    
    // Intentar obtener del cache primero
    let project = await this.redisService.getJson<Project>(cacheKey);
    
    if (!project) {
      // Si no está en cache, buscar en base de datos
      project = await this.projectRepository.findOne({ where: { id } });
      
      if (!project) {
        throw new Error(`Proyecto con id ${id} no encontrado`);
      }
      
      // Cachear por 10 minutos
      await this.redisService.setJson(cacheKey, project, 600);
    }
    
    return project;
  }

  async findByUser(userId: string) {
    const cacheKey = `projects:user:${userId}`;

    // Intentar obtener del cache primero
    let projects = await this.redisService.getJson<any[]>(cacheKey);

    if (!projects) {
      // Devolvemos el proyecto + los permisos granulares de la asignación
      // para que el front pueda mostrar/ocultar acciones según corresponda.
      // También cargamos los workloads (sólo poblados cuando source='argocd')
      // para que las cards puedan expandirse mostrando los Deployments.
      const rows = await this.projectRepository
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.workloads', 'workload')
        .innerJoin(
          'user_projects',
          'up',
          'up.projectId = project.id AND up.userId = :userId',
          { userId },
        )
        .where('project.archivedAt IS NULL')
        .addSelect([
          'up.canStart AS up_canstart',
          'up.canStop AS up_canstop',
          'up.canRestart AS up_canrestart',
          'up.canAccessEnvs AS up_canaccessenvs',
          'up.canAccessLogs AS up_canaccesslogs',
        ])
        .getRawAndEntities();

      // OJO: como `workloads` es OneToMany y se trae con leftJoinAndSelect, un
      // proyecto con N workloads genera N filas en rows.raw pero 1 sola entity.
      // Indexar rows.raw por el índice de la entity desalinea los permisos al
      // primer proyecto multi-workload. Mapeamos por project.id (1ª fila por
      // proyecto) para que cada entity reciba SUS permisos.
      const permsByProject = new Map<string, any>();
      for (const row of rows.raw) {
        if (permsByProject.has(row.project_id)) continue;
        permsByProject.set(row.project_id, {
          canStart: row.up_canstart ?? true,
          canStop: row.up_canstop ?? true,
          canRestart: row.up_canrestart ?? true,
          canAccessEnvs: row.up_canaccessenvs ?? false,
          // Default true para asignaciones previas a la columna (NULL en SQL):
          // por producto, logs es de acceso liberal salvo que el admin lo apague.
          canAccessLogs: row.up_canaccesslogs ?? true,
        });
      }

      projects = rows.entities.map((project) => ({
        ...project,
        permissions: permsByProject.get(project.id),
      }));

      // Cachear por 5 minutos
      await this.redisService.setJson(cacheKey, projects, 300);
    }

    return projects;
  }

  async findAvailableProjects(userId: string) {
    const cacheKey = `projects:available:${userId}`;
    
    // Intentar obtener del cache primero
    let projects = await this.redisService.getJson<Project[]>(cacheKey);
    
    if (!projects) {
      // Si no está en cache, buscar en base de datos
      // Devuelve proyectos que NO están asignados a este usuario específico
      projects = await this.projectRepository
        .createQueryBuilder('project')
        .leftJoin(
          'user_projects',
          'up',
          'up.projectId = project.id AND up.userId = :userId',
          { userId }
        )
        .where('up.projectId IS NULL')
        .andWhere('project.archivedAt IS NULL')
        .getMany();
      
      // Cachear por 5 minutos
      await this.redisService.setJson(cacheKey, projects, 300);
    }
    
    return projects;
  }

  async findAll(): Promise<Project[]> {
    const cacheKey = 'projects:all';
    
    // Intentar obtener del cache primero
    let projects = await this.redisService.getJson<Project[]>(cacheKey);
    
    if (!projects) {
      // Si no está en cache, buscar en base de datos
      projects = await this.projectRepository.find({
        where: { archivedAt: IsNull() },
        relations: ['workloads'],
      });

      // Cachear por 10 minutos
      await this.redisService.setJson(cacheKey, projects, 600);
    }

    return projects;
  }

  /**
   * Limpiar cache específico de un usuario
   */
  async clearUserCache(userId: string) {
    await this.redisService.del(`projects:user:${userId}`);
  }

  /**
   * Limpiar todo el cache de proyectos
   */
  async clearProjectsCache() {
    await this.redisService.clearPattern('projects:*');
  }

  /**
   * Obtener estado de un proyecto desde Coolify con cache
   */
  async getProjectStatus(projectId: string) {
    const cacheKey = `project:status:${projectId}`;
    
    // Cache muy corto (30 segundos) para estados que cambian frecuentemente
    let status = await this.redisService.getJson(cacheKey);
    
    if (!status) {
      const project = await this.findOne(projectId);
      if (project.source !== 'coolify' || !project.coolifyAppId) {
        // Para proyectos Argo el "status" lo expone el sync (sync/health en el row mismo).
        // No tenemos un equivalente HTTP-fetch acá: devolvemos lo que ya tenemos.
        return {
          source: project.source,
          syncStatus: project.syncStatus,
          healthStatus: project.healthStatus,
          lastSyncAt: project.lastSyncAt,
        };
      }
      status = await this.coolifyService.getProjectStatus(project.coolifyAppId);
      await this.redisService.setJson(cacheKey, status, 30);
    }
    
    return status;
  }
}
