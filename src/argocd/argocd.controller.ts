import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ArgoInstancesService } from './argocd-instances.service';
import { ArgoSyncService } from './argocd-sync.service';
import { ArgoActionsService } from './argocd-actions.service';

@UseGuards(RolesGuard)
@Controller('argocd')
export class ArgoCDController {
  constructor(
    private readonly instances: ArgoInstancesService,
    private readonly sync: ArgoSyncService,
    private readonly actions: ArgoActionsService,
  ) {}

  // -------- Instances management (admin only) --------

  @Roles('admin')
  @Get('instances')
  async listInstances() {
    const list = await this.instances.findAll();
    return list.map((i) => this.instances.toPublic(i));
  }

  @Roles('admin')
  @Post('instances')
  async createInstance(
    @Body()
    body: {
      name: string;
      serverUrl: string;
      authToken: string;
      syncIntervalMs?: number;
      insecureSkipTlsVerify?: boolean;
    },
  ) {
    const created = await this.instances.create(body);
    // Registra el cron para esta instancia recién creada.
    this.sync.registerInterval(created);
    return this.instances.toPublic(created);
  }

  @Roles('admin')
  @Patch('instances/:id')
  async updateInstance(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      serverUrl?: string;
      authToken?: string;
      syncIntervalMs?: number;
      enabled?: boolean;
      insecureSkipTlsVerify?: boolean;
    },
  ) {
    const updated = await this.instances.update(id, body);
    if (updated.enabled) this.sync.registerInterval(updated);
    else this.sync.unregisterInterval(updated.id);
    return this.instances.toPublic(updated);
  }

  @Roles('admin')
  @Delete('instances/:id')
  async deleteInstance(@Param('id') id: string) {
    this.sync.unregisterInterval(id);
    await this.instances.remove(id);
    return { ok: true };
  }

  // -------- Sync (admin) --------

  @Roles('admin')
  @Post('instances/:id/sync')
  async syncInstance(@Param('id') id: string) {
    const count = await this.sync.syncOne(id);
    return { ok: true, applicationsProcessed: count };
  }

  @Roles('admin')
  @Post('sync-all')
  async syncEverything() {
    return this.sync.syncAll();
  }

  // -------- Per-project actions --------

  @Roles('admin', 'developer')
  @Post('projects/:projectId/sync')
  async syncProject(@Req() req: any, @Param('projectId') projectId: string) {
    return this.actions.sync(req.user, projectId);
  }

  @Roles('admin', 'developer')
  @Post('projects/:projectId/refresh')
  async refreshProject(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() body: { hard?: boolean } = {},
  ) {
    return this.actions.refresh(req.user, projectId, !!body.hard);
  }
}
