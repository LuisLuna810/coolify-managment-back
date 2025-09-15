import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { CoolifyService } from '../coolify/coolify.service';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly coolifyService: CoolifyService,
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

    return projects;
  }


  @Interval(60000)
  async handleAutoSync() {
    this.logger.log('Ejecutando sync automático con Coolify...');
    await this.syncProjectsFromCoolify();
    this.logger.log('Sync completado ✅');
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new Error(`Proyecto con id ${id} no encontrado`);
    }
    return project;
  }

  async findByUser(userId: string) {
    return this.projectRepository
      .createQueryBuilder('project')
      .innerJoin('user_projects', 'up', 'up.projectId = project.id')
      .where('up.userId = :userId', { userId })
      .getMany();
  }

  async findAvailableProjects() {
    // Get all projects that are NOT assigned to any user
    return this.projectRepository
      .createQueryBuilder('project')
      .leftJoin('user_projects', 'up', 'up.projectId = project.id')
      .where('up.projectId IS NULL')
      .getMany();
  }

  async findAll(): Promise<Project[]> {
    return this.projectRepository.find();
  }
}
