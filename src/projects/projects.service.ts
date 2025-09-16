import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { CoolifyService } from '../coolify/coolify.service';
import { RedisService } from '../redis/redis.service';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly coolifyService: CoolifyService,
    private readonly redisService: RedisService,
  ) { }

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
        });
      } else {
        project.name = app.name;
        project.description = app.description || null;
      }

      await this.projectRepository.save(project);
      projects.push(project);
    }

    // Limpiar cache después de sincronización
    await this.redisService.clearPattern('projects:*');
    this.logger.log('Cache de proyectos limpiado después de sync');

    return projects;
  }

  @Interval(60000)
  async handleAutoSync() {
    this.logger.log('Ejecutando sync automático con Coolify...');
    await this.syncProjectsFromCoolify();
    this.logger.log('Sync completado ✅');
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
    let projects = await this.redisService.getJson<Project[]>(cacheKey);
    
    if (!projects) {
      // Si no está en cache, buscar en base de datos
      projects = await this.projectRepository
        .createQueryBuilder('project')
        .innerJoin('user_projects', 'up', 'up.projectId = project.id')
        .where('up.userId = :userId', { userId })
        .getMany();
      
      // Cachear por 5 minutos
      await this.redisService.setJson(cacheKey, projects, 300);
    }
    
    return projects;
  }

  async findAvailableProjects() {
    const cacheKey = 'projects:available';
    
    // Intentar obtener del cache primero
    let projects = await this.redisService.getJson<Project[]>(cacheKey);
    
    if (!projects) {
      // Si no está en cache, buscar en base de datos
      projects = await this.projectRepository
        .createQueryBuilder('project')
        .leftJoin('user_projects', 'up', 'up.projectId = project.id')
        .where('up.projectId IS NULL')
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
      projects = await this.projectRepository.find();
      
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
      status = await this.coolifyService.getProjectStatus(project.coolifyAppId);
      
      // Cachear solo por 30 segundos
      await this.redisService.setJson(cacheKey, status, 30);
    }
    
    return status;
  }
}
