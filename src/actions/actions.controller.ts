import { Controller, Post, Param, Body, UseGuards, Request, Get, Query } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('actions')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) { }

  @Roles('admin', 'developer')
  @Post(':projectId/start')
  start(@Request() req, @Param('projectId') projectId: string) {
    return this.actionsService.start(req.user, projectId);
  }

  @Roles('admin', 'developer')
  @Post(':projectId/stop')
  stop(@Request() req, @Param('projectId') projectId: string) {
    return this.actionsService.stop(req.user, projectId);
  }

  @Roles('admin', 'developer')
  @Post(':projectId/restart')
  restart(@Request() req, @Param('projectId') projectId: string) {
    return this.actionsService.restart(req.user, projectId);
  }

  @Roles('admin', 'developer')
  @Get(':projectId/envs')
  listEnvs(@Request() req, @Param('projectId') projectId: string) {
    return this.actionsService.listEnvs(req.user, projectId);
  }

  @Roles('admin', 'developer')
  @Post(':projectId/envs')
  updateEnv(
    @Request() req,
    @Param('projectId') projectId: string,
    @Body() body: { key: string; value: string },
  ) {
    return this.actionsService.updateEnv(req.user, projectId, body.key, body.value);
  }

  @Roles('admin', 'developer')
  @Get(':projectId/status')
  getStatus(@Request() req, @Param('projectId') projectId: string) {
    return this.actionsService.getStatus(req.user, projectId);
  }

  @Roles('admin', 'developer')
  @Get(':projectId/logs')
  getLogs(
    @Request() req,
    @Param('projectId') projectId: string,
    @Query('lines') lines?: string,
  ) {
    const linesNum = lines ? parseInt(lines, 10) : 100;
    return this.actionsService.getLogs(req.user, projectId, linesNum);
  }

}
