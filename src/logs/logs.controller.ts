import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { LogsService } from './logs.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) { }

  @Roles('admin')
  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = {
      limit: limit ? parseInt(limit, 10) : 25,
      offset: offset ? parseInt(offset, 10) : 0,
      userId,
      projectId,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    return this.logsService.findAll(filters);
  }

  @Roles('admin')
  @Get('user/:sub')
  findByUser(@Param('sub') sub: string) {
    return this.logsService.findByUser(sub);
  }

  @Roles('admin')
  @Get('project/:projectId')
  findByProject(@Param('projectId') projectId: string) {
    return this.logsService.findByProject(projectId);
  }

  @Roles('admin')
  @Get('stats')
  getStats() {
    return this.logsService.getStats();
  }
}
