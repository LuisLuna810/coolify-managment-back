import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { TokenValidationService } from '../services/token-validation.service'
import type { Response } from 'express'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenValidationService: TokenValidationService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    
    const request = context.switchToHttp().getRequest()
    const response = context.switchToHttp().getResponse<Response>()

    try {
      // Use TokenValidationService for consistent token validation and logout
      const user = await this.tokenValidationService.validateTokenAndLogoutIfInvalid(
        request, 
        response
      )
      
      // Add user to request
      request.user = user
      
      // If no specific roles are required, just authentication is enough
      if (!requiredRoles) {
        return true
      }

      // Check if user has required role
      const hasRequiredRole = requiredRoles.includes(user.role)
      
      return hasRequiredRole
    } catch (error) {
      console.error("❌ RolesGuard: Token validation failed:", error.message)
      // TokenValidationService already handled logout/cookie cleanup
      return false
    }
  }
}
