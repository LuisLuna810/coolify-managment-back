import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { TokenValidationInterceptor } from '../interceptors/token-validation.interceptor';

/**
 * Decorador que aplica autenticación JWT con validación automática de token
 * y logout automático en caso de token inválido o expirado
 */
export function AuthWithAutoLogout() {
  return applyDecorators(
    UseGuards(JwtAuthGuard),
    UseInterceptors(TokenValidationInterceptor),
  );
}

/**
 * Decorador más ligero que solo aplica el guard de autenticación
 */
export function Auth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard),
  );
}