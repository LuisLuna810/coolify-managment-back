import { Injectable, NestInterceptor, ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TokenValidationService } from '../services/token-validation.service';
import type { Response } from 'express';

@Injectable()
export class TokenValidationInterceptor implements NestInterceptor {
  constructor(private readonly tokenValidationService: TokenValidationService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();

    try {
      // Validar token y realizar logout automático si es inválido
      const user = await this.tokenValidationService.validateTokenAndLogoutIfInvalid(
        request,
        response
      );

      // Agregar información del usuario al request para uso posterior
      request.user = user;

      return next.handle();
    } catch (error) {
      throw error;
    }
  }
}