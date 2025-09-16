import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { UsersService } from '../users/users.service'
import { User } from '../users/entities/user.entity'
import { TokenValidationService } from './services/token-validation.service'
import { RedisService } from '../redis/redis.service'
import type { Response } from 'express'

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenValidationService: TokenValidationService,
    private readonly redisService: RedisService,
  ) { }

  async validateUser(email: string, pass: string): Promise<User | null> {
    // Cache key para el usuario por email
    const userCacheKey = `user:email:${email}`;
    
    // Intentar obtener del cache primero
    let user = await this.redisService.getJson<User>(userCacheKey);
    
    if (!user) {
      // Si no está en cache, buscar en base de datos
      user = await this.usersService.findByEmail(email);
      
      if (user) {
        // Cachear el usuario por 5 minutos
        await this.redisService.setJson(userCacheKey, user, 300);
      }
    }
    
    if (!user || !user.password) {
      return null;
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;

    return user;
  }

  async login(user: User) {
    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      username: user.username,
    }

    const token = this.jwtService.sign(payload);
    
    // Cachear la sesión del usuario por 1 hora
    const sessionCacheKey = `session:${user.id}`;
    await this.redisService.setJson(sessionCacheKey, {
      userId: user.id,
      token,
      loginTime: new Date().toISOString(),
      ...payload
    }, 3600);

    return {
      token,
      user: payload,
    }
  }

  async register(userData: Partial<User>) {
    const newUser: Partial<User> = {
      ...userData,
      role: (userData.role as 'admin' | 'developer') || 'developer',
    }
    
    const createdUser = await this.usersService.create(newUser);
    
    // Limpiar cache de usuarios cuando se crea uno nuevo
    await this.redisService.clearPattern('user:*');
    
    return createdUser;
  }

  async validateTokenAndGetUser(token: string) {
    // Cache key para validación de tokens
    const tokenCacheKey = `token:valid:${token}`;
    
    // Verificar si el token ya fue validado recientemente
    const cachedResult = await this.redisService.getJson(tokenCacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    
    const validationResult = await this.tokenValidationService.validateToken(token);
    
    if (!validationResult.isValid) {
      // Cachear tokens inválidos por solo 1 minuto para evitar spam
      await this.redisService.setJson(tokenCacheKey, validationResult, 60);
      throw new UnauthorizedException(validationResult.error);
    }

    // Cachear tokens válidos por 5 minutos
    await this.redisService.setJson(tokenCacheKey, validationResult.user, 300);
    
    return validationResult.user;
  }

  async logout(response: Response, userId?: string) {
    this.tokenValidationService.performLogout(response);
    
    // Limpiar cache de sesión del usuario
    if (userId) {
      const sessionCacheKey = `session:${userId}`;
      await this.redisService.del(sessionCacheKey);
      
      // Limpiar cache de validación de tokens del usuario
      await this.redisService.clearPattern(`token:valid:*`);
    }
    
    return { message: 'Logged out successfully' };
  }

  async validateRequest(request: any, response: Response) {
    return this.tokenValidationService.validateTokenAndLogoutIfInvalid(request, response);
  }

  /**
   * Obtener sesión activa del usuario desde cache
   */
  async getUserSession(userId: string) {
    const sessionCacheKey = `session:${userId}`;
    return await this.redisService.getJson(sessionCacheKey);
  }

  /**
   * Invalidar todas las sesiones de un usuario
   */
  async invalidateUserSessions(userId: string) {
    const sessionCacheKey = `session:${userId}`;
    await this.redisService.del(sessionCacheKey);
    await this.redisService.clearPattern(`user:*:${userId}`);
  }
}
