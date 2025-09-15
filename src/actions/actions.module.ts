import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionsService } from './actions.service';
import { ActionsController } from './actions.controller';
import { ActionLog } from './entities/action-log.entity';
import { CoolifyModule } from '../coolify/coolify.module';
import { ProjectsModule } from '../projects/projects.module';
import { UserProjectsModule } from '../user-projects/user-projects.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActionLog]),
    CoolifyModule,
    ProjectsModule,
    UserProjectsModule,
    forwardRef(() => AuthModule), // Use forwardRef to avoid potential circular dependency
  ],
  controllers: [ActionsController],
  providers: [ActionsService, RolesGuard],
})
export class ActionsModule {}
