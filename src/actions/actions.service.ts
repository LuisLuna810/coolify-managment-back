import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionLog } from './entities/action-log.entity';
import { CoolifyService } from '../coolify/coolify.service';
import { ProjectsService } from '../projects/projects.service';
import { UserProjectsService } from '../user-projects/user-projects.service';
import { Project } from '../projects/entities/project.entity';

@Injectable()
export class ActionsService {
  constructor(
    @InjectRepository(ActionLog)
    private readonly logRepository: Repository<ActionLog>,
    private readonly coolifyService: CoolifyService,
    private readonly projectsService: ProjectsService,
    private readonly userProjectsService: UserProjectsService,
  ) { }

  private async checkAccess(
    userId: string,
    projectId: string,
    role: string,
    action?: 'start' | 'stop' | 'restart' | 'envs',
  ) {
    if (role === 'admin') return;

    const userProjects = await this.userProjectsService.findByUser(userId);
    const assigned = userProjects.find((up) => up.project.id === projectId);
    if (!assigned) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }

    if (action) {
      const map: Record<string, keyof typeof assigned> = {
        start: 'canStart',
        stop: 'canStop',
        restart: 'canRestart',
        envs: 'canAccessEnvs',
      };
      const key = map[action];
      if (key && assigned[key] === false) {
        throw new ForbiddenException(
          `No tienes permiso para ejecutar "${action}" en este proyecto`,
        );
      }
    }
  }

  private async logAction(userId: string, projectId: string, action: string) {
    const log = this.logRepository.create({
      user: { id: userId } as any,
      project: { id: projectId } as any,
      action,
    });
    await this.logRepository.save(log);
  }

  /**
   * Garantiza que el proyecto es de Coolify (no Argo) y devuelve su coolifyAppId
   * no-null. Las acciones de este service son específicas de Coolify; para
   * proyectos Argo el frontend debe pegar a /argocd/projects/:id/sync etc.
   */
  private requireCoolifyApp(project: Project): string {
    if (project.source !== 'coolify' || !project.coolifyAppId) {
      throw new BadRequestException(
        'Esta acción aplica solo a proyectos Coolify — para Argo usá /argocd/projects/:id/...',
      );
    }
    return project.coolifyAppId;
  }

  async start(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role, 'start');

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    await this.coolifyService.startProject(appId);
    await this.coolifyService.invalidateCache(appId);
    await this.logAction(user.userId, projectId, 'start');
    return { message: 'Proyecto iniciado' };
  }

  async stop(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role, 'stop');

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    await this.coolifyService.stopProject(appId);
    await this.coolifyService.invalidateCache(appId);
    await this.logAction(user.userId, projectId, 'stop');
    return { message: 'Proyecto detenido' };
  }

  async restart(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role, 'restart');

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    await this.coolifyService.restartProject(appId);
    await this.coolifyService.invalidateCache(appId);
    await this.logAction(user.userId, projectId, 'restart');
    return { message: 'Proyecto reiniciado' };
  }

  async listEnvs(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role, 'envs');

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    const envs = await this.coolifyService.getProjectEnvs(appId);

    const seen = new Set<string>();
    const filtered = envs.filter((env: any) => {
      if (!env.value || env.value.trim() === '') return false;
      if (seen.has(env.key)) return false;
      seen.add(env.key);
      return true;
    });

    await this.logAction(user.userId, projectId, 'env-list');
    return filtered;
  }

  async updateEnv(user: any, projectId: string, key: string, value: string) {
    await this.checkAccess(user.userId, projectId, user.role, 'envs');

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    await this.coolifyService.updateProjectEnv(appId, key, key, value);
    await this.logAction(user.userId, projectId, 'env-update');
    return { message: `Variable ${key} actualizada` };
  }


  async getContainers(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    const containers = await this.coolifyService.getContainers(appId);

    return { containers };
  }

  async getLogs(user: any, projectId: string, lines = 100, containerId?: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    const logs = await this.coolifyService.getLogs(appId, lines, containerId);

    await this.logAction(user.userId, projectId, 'get-logs');

    return { logs };
  }

  async getStatus(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    const [status, latestDeployment] = await Promise.all([
      this.coolifyService.getProjectStatus(appId),
      this.coolifyService.getLatestDeployment(appId),
    ]);

    await this.logAction(user.userId, projectId, 'get-status');

    return {
      ...status,
      lastDeployment: this.formatDeployment(latestDeployment),
      domains: this.extractDomains(status),
    };
  }

  /**
   * Coolify expone los dominios en dos lugares según el tipo de aplicación:
   *  - `fqdn`: string para apps tipo "application" (nixpacks/dockerfile).
   *    Puede ser una URL única o varias separadas por coma.
   *  - `docker_compose_domains`: JSON `{ service: { domain: "url[,url]" } }`
   *    para apps tipo docker-compose, una entry por servicio.
   * Consolidamos todo en una lista única de URLs limpias.
   */
  private extractDomains(status: any): string[] {
    const result: string[] = [];

    if (typeof status?.fqdn === 'string' && status.fqdn.trim()) {
      result.push(...status.fqdn.split(',').map((u: string) => u.trim()));
    }

    if (status?.docker_compose_domains) {
      try {
        const parsed =
          typeof status.docker_compose_domains === 'string'
            ? JSON.parse(status.docker_compose_domains)
            : status.docker_compose_domains;
        for (const svc of Object.values(parsed || {})) {
          const domain = (svc as any)?.domain;
          if (typeof domain === 'string' && domain.trim()) {
            result.push(...domain.split(',').map((u: string) => u.trim()));
          }
        }
      } catch {
        // si el JSON está mal formado, ignoramos silenciosamente
      }
    }

    // Dedupe + filtrar URLs vacías
    return [...new Set(result.filter(Boolean))];
  }

  async listDeployments(
    user: any,
    projectId: string,
    take = 10,
    skip = 0,
  ) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const appId = this.requireCoolifyApp(project);
    const { count, deployments } =
      await this.coolifyService.getApplicationDeployments(appId, take, skip);

    return {
      count,
      deployments: deployments.map((d) => this.formatDeployment(d)),
    };
  }

  private formatDeployment(d: any) {
    if (!d) return null;

    const isTerminal = ['finished', 'failed', 'cancelled-by-user'].includes(
      d.status,
    );

    const started = d.created_at ? new Date(d.created_at).getTime() : null;
    const ended = d.finished_at
      ? new Date(d.finished_at).getTime()
      : isTerminal && d.updated_at
        ? new Date(d.updated_at).getTime()
        : null;
    const durationSeconds =
      started && ended ? Math.round((ended - started) / 1000) : null;

    let trigger: 'webhook' | 'api' | 'manual' = 'manual';
    if (d.is_webhook) trigger = 'webhook';
    else if (d.is_api) trigger = 'api';

    return {
      uuid: d.deployment_uuid,
      status: d.status,
      isTerminal,
      commit: d.commit,
      shortCommit:
        typeof d.commit === 'string' ? d.commit.substring(0, 7) : null,
      commitMessage: d.commit_message || null,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      finishedAt: d.finished_at || (isTerminal ? d.updated_at : null),
      durationSeconds,
      trigger,
      rollback: !!d.rollback,
      restartOnly: !!d.restart_only,
      pullRequestId: d.pull_request_id || null,
    };
  }
}
