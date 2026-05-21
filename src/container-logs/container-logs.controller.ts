import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ContainerLogsService } from './container-logs.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('container-logs')
export class ContainerLogsController {
  constructor(private readonly service: ContainerLogsService) {}

  @Roles('admin', 'developer')
  @Get(':projectId')
  getLogs(
    @Request() req,
    @Param('projectId') projectId: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
    @Query('container') container?: string,
    @Query('pod') pod?: string,
    @Query('filter') filter?: string,
    @Query('direction') direction?: 'forward' | 'backward',
  ) {
    return this.service.getLogs(req.user, projectId, {
      since,
      limit: limit ? parseInt(limit, 10) : undefined,
      container,
      pod,
      filter,
      direction,
    });
  }
}
