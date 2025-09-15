import { Controller, Get, UseGuards, Request, Req, Param } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) { }


  @Roles('admin')
  @Get()
  async findAll(): Promise<Project[]> {
    return this.projectsService.findAll();
  }

  @Roles('admin')
  @Get('sync')
  async sync(): Promise<Project[]> {
    return this.projectsService.syncProjectsFromCoolify();
  }

  @Roles('admin', 'developer')
  @Get('my')
  findMyProjects(@Req() req) {
    return this.projectsService.findByUser(req.user.userId);
  }

  @Roles('admin')
  @Get('available')
  async getAvailableProjects() {
    return this.projectsService.findAvailableProjects();
  }

  @Roles('admin')
  @Get('assigned/:userId')
  async getAssignedProjects(@Param('userId') userId: string) {
    return this.projectsService.findByUser(userId);
  }

}
