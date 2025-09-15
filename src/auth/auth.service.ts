import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { UsersService } from '../users/users.service'
import { User } from '../users/entities/user.entity'
import { TokenValidationService } from './services/token-validation.service'
import type { Response } from 'express'

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenValidationService: TokenValidationService,
  ) { }

  async validateUser(email: string, pass: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    
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

    return {
      token: this.jwtService.sign(payload),
      user: payload,
    }
  }

  async register(userData: Partial<User>) {
    const newUser: Partial<User> = {
      ...userData,
      role: (userData.role as 'admin' | 'developer') || 'developer',
    }
    return this.usersService.create(newUser)
  }

  async validateTokenAndGetUser(token: string) {
    const validationResult = await this.tokenValidationService.validateToken(token);
    
    if (!validationResult.isValid) {
      throw new UnauthorizedException(validationResult.error);
    }

    return validationResult.user;
  }

  async logout(response: Response) {
    this.tokenValidationService.performLogout(response);
    return { message: 'Logged out successfully' };
  }

  async validateRequest(request: any, response: Response) {
    return this.tokenValidationService.validateTokenAndLogoutIfInvalid(request, response);
  }
}
