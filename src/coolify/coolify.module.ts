import { Module } from '@nestjs/common';
import { CoolifyService } from './coolify.service';

@Module({
  providers: [CoolifyService],
  exports: [CoolifyService], // 👈 exportarlo para que otros módulos lo usen
})
export class CoolifyModule {}
