import { Module, Global } from '@nestjs/common';
import { HealthService } from './health.service';

@Global()
@Module({
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
