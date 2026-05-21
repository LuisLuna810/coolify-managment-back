import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArgoInstance } from './entities/argo-instance.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectWorkload } from '../projects/entities/project-workload.entity';
import { ActionLog } from '../actions/entities/action-log.entity';
import { ArgoInstancesService } from './argocd-instances.service';
import { ArgoSyncService } from './argocd-sync.service';
import { ArgoActionsService } from './argocd-actions.service';
import { ArgoCDController } from './argocd.controller';
import { CryptoService } from './crypto.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RedisModule } from '../redis/redis.module';
import { UserProjectsModule } from '../user-projects/user-projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArgoInstance, Project, ProjectWorkload, ActionLog]),
    forwardRef(() => AuthModule),
    RedisModule,
    UserProjectsModule,
  ],
  providers: [
    CryptoService,
    ArgoInstancesService,
    ArgoSyncService,
    ArgoActionsService,
    RolesGuard,
  ],
  controllers: [ArgoCDController],
  exports: [ArgoInstancesService, ArgoSyncService, CryptoService],
})
export class ArgoCDModule {}
