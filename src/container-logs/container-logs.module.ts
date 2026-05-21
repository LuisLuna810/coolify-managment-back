import { Module, forwardRef } from '@nestjs/common';
import { ContainerLogsController } from './container-logs.controller';
import { ContainerLogsService } from './container-logs.service';
import { ProjectsModule } from '../projects/projects.module';
import { UserProjectsModule } from '../user-projects/user-projects.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    ProjectsModule,
    UserProjectsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ContainerLogsController],
  providers: [ContainerLogsService, RolesGuard],
})
export class ContainerLogsModule {}
