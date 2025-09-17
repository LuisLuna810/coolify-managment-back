import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { ActionLog } from '../actions/entities/action-log.entity';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActionLog]),
    RedisModule,
    forwardRef(() => AuthModule), // Use forwardRef to avoid potential circular dependency
  ],
  controllers: [LogsController],
  providers: [LogsService, RolesGuard],
  exports: [LogsService],
})
export class LogsModule {}
