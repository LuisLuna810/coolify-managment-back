import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenValidationService } from '../services/token-validation.service';
import type { Response } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly tokenValidationService: TokenValidationService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    
    try {
      // Utilizar el servicio de validación de tokens
      const user = await this.tokenValidationService.validateTokenAndLogoutIfInvalid(
        request, 
        response
      );

      // Agregar la información del usuario al request
      request.user = user;

      return true;
    } catch (error) {
      // El servicio ya maneja el logout automático
      throw error;
    }
  }
}
