import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { ActionLog } from '../actions/entities/action-log.entity';
import { ArgoInstancesService } from './argocd-instances.service';
import { UserProjectsService } from '../user-projects/user-projects.service';

type ArgoAction = 'sync' | 'refresh';

@Injectable()
export class ArgoActionsService {
  private readonly logger = new Logger(ArgoActionsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ActionLog)
    private readonly logRepo: Repository<ActionLog>,
    private readonly instances: ArgoInstancesService,
    private readonly userProjects: UserProjectsService,
  ) {}

  private async getArgoProject(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    if (project.source !== 'argocd' || !project.argoInstanceId || !project.argoAppName) {
      throw new BadRequestException(
        'Este proyecto no es de ArgoCD — usá los endpoints de Coolify',
      );
    }
    return project;
  }

  /**
   * Reusa los permisos de la asignación user_projects:
   *   sync    → canStart (sync ≈ deploy/start en mundo argo)
   *   refresh → read-only (sólo necesita estar asignado o ser admin)
   */
  private async checkAccess(
    userId: string,
    projectId: string,
    role: string,
    action: ArgoAction,
  ) {
    if (role === 'admin') return;
    const userProjects = await this.userProjects.findByUser(userId);
    const assigned = userProjects.find((up) => up.project.id === projectId);
    if (!assigned) throw new ForbiddenException('No tienes acceso a este proyecto');
    if (action === 'sync' && assigned.canStart === false) {
      throw new ForbiddenException('No tienes permiso para sincronizar este proyecto');
    }
  }

  private async logAction(userId: string, projectId: string, action: string) {
    const log = this.logRepo.create({
      user: { id: userId } as any,
      project: { id: projectId } as any,
      action,
    });
    await this.logRepo.save(log).catch((err) => {
      this.logger.warn(`Falló logAction(${action}): ${err?.message}`);
    });
  }

  async sync(user: { userId: string; role: string }, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role, 'sync');
    const project = await this.getArgoProject(projectId);
    const instance = await this.instances.findOne(project.argoInstanceId!);
    const client = this.instances.getClient(instance);
    const result = await client.syncApplication(project.argoAppName!, { prune: false });
    await this.logAction(user.userId, projectId, 'argo:sync');
    return {
      message: 'Sync iniciado',
      argoAppName: project.argoAppName,
      phase: result.status?.operationState?.phase,
    };
  }

  async refresh(user: { userId: string; role: string }, projectId: string, hard = false) {
    await this.checkAccess(user.userId, projectId, user.role, 'refresh');
    const project = await this.getArgoProject(projectId);
    const instance = await this.instances.findOne(project.argoInstanceId!);
    const client = this.instances.getClient(instance);
    const result = await client.refreshApplication(project.argoAppName!, hard);
    await this.logAction(user.userId, projectId, hard ? 'argo:refresh-hard' : 'argo:refresh');
    return {
      message: 'Refresh disparado',
      argoAppName: project.argoAppName,
      syncStatus: result.status?.sync?.status,
      healthStatus: result.status?.health?.status,
    };
  }
}
