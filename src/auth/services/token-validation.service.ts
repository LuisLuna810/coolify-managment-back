import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service';
import type { Response } from 'express';

export interface TokenValidationResult {
  isValid: boolean;
  user?: {
    userId: string;
    email: string;
    role: string;
    username: string;
  };
  error?: string;
}

@Injectable()
export class TokenValidationService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async validateToken(token: string): Promise<TokenValidationResult> {
    if (!token) {
      return {
        isValid: false,
        error: 'No token provided'
      };
    }

    try {
      // Verificar si el token es válido y no ha expirado
      const payload = this.jwtService.verify(token);
      
      // Verificar estructura del payload
      if (!payload.sub || !payload.email || !payload.role) {
        return {
          isValid: false,
          error: 'Invalid token payload'
        };
      }

      // Verificar si el usuario aún existe en la base de datos
      const user = await this.usersService.findOne(payload.sub);
      
      if (!user) {
        return {
          isValid: false,
          error: 'User not found'
        };
      }

      // Verificar si el usuario está activo
      if (!user.isActive) {
        return {
          isValid: false,
          error: 'User account is inactive'
        };
      }

      return {
        isValid: true,
        user: {
          userId: payload.sub,
          email: payload.email,
          role: payload.role,
          username: payload.username
        }
      };

    } catch (error) {
      let errorMessage = 'Authentication failed';
      
      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Token expired';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token';
      } else if (error.name === 'NotBeforeError') {
        errorMessage = 'Token not active';
      }

      return {
        isValid: false,
        error: errorMessage
      };
    }
  }

  extractTokenFromRequest(request: any): string | null {
    // Primero intentar desde cookies
    if (request.cookies && request.cookies.token) {
      return request.cookies.token;
    }
    
    // Luego desde el header Authorization
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return null;
  }

  performLogout(response: Response): void {
    // Limpiar la cookie del token
    response.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });
  }

  async validateTokenAndLogoutIfInvalid(request: any, response: Response): Promise<any> {
    const token = this.extractTokenFromRequest(request);
    
    if (!token) {
      this.performLogout(response);
      throw new UnauthorizedException('No token provided');
    }
    
    const validationResult = await this.validateToken(token);

    if (!validationResult.isValid) {
      this.performLogout(response);
      throw new UnauthorizedException(validationResult.error);
    }

    return validationResult.user;
  }
}