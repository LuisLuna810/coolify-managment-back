import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { RedisService } from '../redis/redis.service';

type Check = {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
};

@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly redisService: RedisService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.checkRedis();
      this.logger.log('✅ Redis connection successful');
    } catch (err: any) {
      this.logger.error(`❌ Redis check failed: ${err?.message}`);
    }
  }

  /**
   * Health check enriquecido: valida cada dependencia y devuelve estado
   * agregado. status global = 'ok' si TODAS están healthy; 'degraded' si
   * alguna no está reachable.
   */
  async getHealth() {
    const [redis, db, coolify] = await Promise.all([
      this.checkRedis(),
      this.checkDb(),
      this.checkCoolify(),
    ]);

    const allHealthy = [redis, db, coolify].every((c) => c.status === 'healthy');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'coolify-management-backend',
      checks: { redis, db, coolify },
    };
  }

  private async checkRedis(): Promise<Check> {
    try {
      const start = Date.now();
      await this.redisService.set('health:check', 'ok', 5);
      const result = await this.redisService.get('health:check');
      const latencyMs = Date.now() - start;
      return result === 'ok'
        ? { status: 'healthy', latencyMs }
        : { status: 'unhealthy', latencyMs, error: 'unexpected value' };
    } catch (err: any) {
      return { status: 'unhealthy', error: err?.message || 'unknown' };
    }
  }

  private async checkDb(): Promise<Check> {
    try {
      const start = Date.now();
      await this.dataSource.query('SELECT 1');
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'unhealthy', error: err?.message || 'unknown' };
    }
  }

  private async checkCoolify(): Promise<Check> {
    const baseUrl = process.env.COOLIFY_URL;
    const apiKey = process.env.COOLIFY_API_KEY;
    if (!baseUrl || !apiKey) {
      return { status: 'unhealthy', error: 'COOLIFY_URL or COOLIFY_API_KEY missing' };
    }
    try {
      const start = Date.now();
      await axios.get(`${baseUrl}/api/v1/applications`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'unhealthy', error: err?.message || 'unreachable' };
    }
  }
}
