import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

export const RATE_LIMIT_KEY = 'rate-limit';

/**
 * Decorator para configurar rate limiting en endpoints
 */
export const RateLimit = (options: RateLimitOptions) => {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor && propertyKey) {
      Reflector.createDecorator<RateLimitOptions>()(options)(target, propertyKey, descriptor);
    } else {
      Reflector.createDecorator<RateLimitOptions>()(options)(target);
    }
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Obtener configuración de rate limit del decorador
    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rateLimitOptions) {
      return true; // No hay rate limiting configurado
    }

    const { maxRequests, windowMs, message } = rateLimitOptions;
    
    // Obtener identificador único del cliente (IP + User ID si está autenticado)
    const clientId = this.getClientIdentifier(request);
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `rate_limit:${clientId}:${windowStart}`;

    // Incrementar contador
    const currentCount = await this.redisService.incr(key);
    
    // Establecer expiración si es la primera request en esta ventana
    if (currentCount === 1) {
      await this.redisService.expire(key, Math.ceil(windowMs / 1000));
    }

    // Verificar si se excedió el límite
    if (currentCount > maxRequests) {
      const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);
      
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: message || 'Too many requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Agregar headers informativos
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', maxRequests);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));
    response.setHeader('X-RateLimit-Reset', new Date(windowStart + windowMs).toISOString());

    return true;
  }

  private getClientIdentifier(request: any): string {
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    const userId = request.user?.id || 'anonymous';
    return `${ip}:${userId}`;
  }
}