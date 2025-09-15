import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProject } from './entities/user-project.entity';

@Injectable()
export class UserProjectsService {
  constructor(
    @InjectRepository(UserProject)
    private readonly userProjectRepository: Repository<UserProject>,
  ) {}

  async assign(userId: string, projectId: string): Promise<UserProject> {
    const userProject = this.userProjectRepository.create({ user: { id: userId }, project: { id: projectId } });
    return this.userProjectRepository.save(userProject);
  }

  async unassign(id: string): Promise<void> {
    await this.userProjectRepository.delete(id);
  }

  async unassignUserProject(userId: string, projectId: string): Promise<void> {
    await this.userProjectRepository.delete({
      user: { id: userId },
      project: { id: projectId }
    });
  }

  async findByUser(userId: string): Promise<UserProject[]> {
    return this.userProjectRepository.find({
      where: { user: { id: userId } },
      relations: ['project'],
    });
  }

  async findByProject(projectId: string): Promise<UserProject[]> {
    return this.userProjectRepository.find({
      where: { project: { id: projectId } },
      relations: ['user'],
    });
  }
}
