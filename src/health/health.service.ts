import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService implements OnModuleInit {
  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    // Test Redis connection on startup
    await this.testRedisConnection();
  }

  async getHealth() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        redis: await this.checkRedis(),
        cache: await this.checkCachePerformance(),
      }
    };

    return health;
  }

  private async testRedisConnection() {
    try {
      await this.redisService.set('health:startup', 'ok', 60);
      const result = await this.redisService.get('health:startup');
      
      if (result === 'ok') {
        console.log('✅ Redis connection successful');
      } else {
        console.log('❌ Redis connection failed');
      }
    } catch (error) {
      console.error('❌ Redis connection error:', error);
    }
  }

  private async checkRedis() {
    try {
      const start = Date.now();
      await this.redisService.set('health:check', 'test', 10);
      const result = await this.redisService.get('health:check');
      const latency = Date.now() - start;

      return {
        status: result === 'test' ? 'healthy' : 'unhealthy',
        latency: `${latency}ms`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  private async checkCachePerformance() {
    try {
      const testData = { test: 'performance', timestamp: Date.now() };
      
      // Test JSON operations
      const start = Date.now();
      await this.redisService.setJson('health:perf', testData, 10);
      const retrieved = await this.redisService.getJson<{ test: string }>('health:perf');
      const latency = Date.now() - start;

      return {
        status: retrieved?.test === 'performance' ? 'healthy' : 'unhealthy',
        jsonLatency: `${latency}ms`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }
}