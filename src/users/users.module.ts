import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminInitService } from './services/admin-init.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule), // Use forwardRef to avoid circular dependency
  ],
  controllers: [UsersController],
  providers: [UsersService, RolesGuard, AdminInitService],
  exports: [UsersService, AdminInitService],
})
export class UsersModule {}
