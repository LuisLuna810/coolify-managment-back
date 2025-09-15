import { Controller, Post, Delete, Get, Param, Body, UseGuards } from '@nestjs/common';
import { UserProjectsService } from './user-projects.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserProject } from './entities/user-project.entity';

@UseGuards(RolesGuard)
@Controller('user-projects')
export class UserProjectsController {
  constructor(private readonly userProjectsService: UserProjectsService) {}

  @Roles('admin')
  @Post()
  assign(@Body() body: { userId: string; projectId: string }): Promise<UserProject> {
    return this.userProjectsService.assign(body.userId, body.projectId);
  }

  @Roles('admin')
  @Delete(':id')
  unassign(@Param('id') id: string): Promise<void> {
    return this.userProjectsService.unassign(id);
  }

  @Roles('admin')
  @Delete('user/:userId/project/:projectId')
  unassignUserProject(@Param('userId') userId: string, @Param('projectId') projectId: string): Promise<void> {
    return this.userProjectsService.unassignUserProject(userId, projectId);
  }

  @Roles('admin')
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string): Promise<UserProject[]> {
    return this.userProjectsService.findByUser(userId);
  }

  @Roles('admin')
  @Get('project/:projectId')
  findByProject(@Param('projectId') projectId: string): Promise<UserProject[]> {
    return this.userProjectsService.findByProject(projectId);
  }
}
