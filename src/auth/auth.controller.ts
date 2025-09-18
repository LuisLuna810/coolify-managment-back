import { Controller, Post, Get, Body, Res, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AuthService } from './auth.service'
import { JwtService } from '@nestjs/jwt'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RolesGuard } from './guards/roles.guard'
import { RateLimitGuard } from './guards/rate-limit.guard'
import { Roles } from './decorators/roles.decorator'

// Extend Request type to include user property
interface RequestWithUser extends Express.Request {
    user?: any;
}

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly jwtService: JwtService,
    ) { }

    @Post('login')
    @UseGuards(RateLimitGuard)
    async login(
        @Body() body: { email: string; password: string },
        @Res({ passthrough: true }) res: Response,
    ) {
        const user = await this.authService.validateUser(body.email, body.password)
        if (!user) throw new UnauthorizedException('Invalid credentials')

        const loginResponse = await this.authService.login(user)

        res.cookie('token', loginResponse.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (1 month)
        })

        const safeUser = loginResponse.user
        return { user: safeUser }
    }

    @Post('logout')
    async logout(@Res({ passthrough: true }) res: Response) {
        return this.authService.logout(res);
    }

    @Post('register')
    async register(
        @Body() body: { email: string; password: string; role: 'admin' | 'developer' },
    ) {
        return await this.authService.register(body)
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post('register-developer')
    async registerDeveloper(
        @Body() body: { email: string; password: string; username: string },
    ) {
        const userData = {
            ...body,
            role: 'developer' as const,
            isActive: true,
        }
        return await this.authService.register(userData)
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async me(@Req() req: RequestWithUser) {
        // JwtAuthGuard already validates token and adds user to request
        const user = req.user as any;
        
        // Return user data in consistent format
        return { 
            user: {
                id: user.userId,
                email: user.email,
                role: user.role,
                username: user.username
            }
        };
    }
}
