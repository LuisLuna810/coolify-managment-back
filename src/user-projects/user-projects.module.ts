import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProject } from './entities/user-project.entity';
import { UserProjectsService } from './user-projects.service';
import { UserProjectsController } from './user-projects.controller';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProject]),
    forwardRef(() => AuthModule), // Use forwardRef to avoid potential circular dependency
  ],
  controllers: [UserProjectsController],
  providers: [UserProjectsService, RolesGuard],
  exports: [UserProjectsService, TypeOrmModule],
})
export class UserProjectsModule {}
