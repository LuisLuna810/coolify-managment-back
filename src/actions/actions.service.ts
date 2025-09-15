import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionLog } from './entities/action-log.entity';
import { CoolifyService } from '../coolify/coolify.service';
import { ProjectsService } from '../projects/projects.service';
import { UserProjectsService } from '../user-projects/user-projects.service';

@Injectable()
export class ActionsService {
  constructor(
    @InjectRepository(ActionLog)
    private readonly logRepository: Repository<ActionLog>,
    private readonly coolifyService: CoolifyService,
    private readonly projectsService: ProjectsService,
    private readonly userProjectsService: UserProjectsService,
  ) { }

  private async checkAccess(userId: string, projectId: string, role: string) {
    if (role === 'admin') return;

    const userProjects = await this.userProjectsService.findByUser(userId);
    const assigned = userProjects.find((up) => up.project.id === projectId);
    if (!assigned) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
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

  async start(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    await this.coolifyService.startProject(project.coolifyAppId);
    await this.logAction(user.userId, projectId, 'start');
    return { message: 'Proyecto iniciado' };
  }

  async stop(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    await this.coolifyService.stopProject(project.coolifyAppId);
    await this.logAction(user.userId, projectId, 'stop');
    return { message: 'Proyecto detenido' };
  }

  async restart(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    await this.coolifyService.restartProject(project.coolifyAppId);
    await this.logAction(user.userId, projectId, 'restart');
    return { message: 'Proyecto reiniciado' };
  }

  async listEnvs(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const envs = await this.coolifyService.getProjectEnvs(project.coolifyAppId);

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
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    await this.coolifyService.updateProjectEnv(project.coolifyAppId, key, key, value);
    await this.logAction(user.userId, projectId, 'env-update');
    return { message: `Variable ${key} actualizada` };
  }


  async getLogs(user: any, projectId: string, lines = 100) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const logs = await this.coolifyService.getLogs(project.coolifyAppId, lines);

    await this.logAction(user.userId, projectId, 'get-logs');

    return { logs };
  }

  async getStatus(user: any, projectId: string) {
    await this.checkAccess(user.userId, projectId, user.role);

    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const status = await this.coolifyService.getProjectStatus(project.coolifyAppId);

    await this.logAction(user.userId, projectId, 'get-status');

    return status;
  }


}
