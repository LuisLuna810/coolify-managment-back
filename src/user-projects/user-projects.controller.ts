import { Controller, Post, Patch, Delete, Get, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { UserProjectsService } from './user-projects.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserProject } from './entities/user-project.entity';
import { AssignProjectDto, PermissionsDto } from './dto/user-project.dto';

@UseGuards(RolesGuard)
@Controller('user-projects')
export class UserProjectsController {
  constructor(private readonly userProjectsService: UserProjectsService) {}

  @Roles('admin')
  @Post()
  assign(@Body() body: AssignProjectDto): Promise<UserProject> {
    const { userId, projectId, ...permissions } = body;
    return this.userProjectsService.assign(userId, projectId, permissions);
  }

  @Roles('admin')
  @Patch('user/:userId/project/:projectId')
  updatePermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() permissions: PermissionsDto,
  ): Promise<UserProject> {
    return this.userProjectsService.updatePermissions(userId, projectId, permissions);
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
