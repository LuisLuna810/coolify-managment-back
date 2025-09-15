import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenValidationService } from './services/token-validation.service';

@Module({
  imports: [
    forwardRef(() => UsersModule), // Use forwardRef to avoid circular dependency
    PassportModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'secretKey',
      signOptions: { expiresIn: '30d' }, // Token expires in 30 days (1 month)
    }),
  ],
  providers: [AuthService, JwtStrategy, TokenValidationService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, TokenValidationService],
})
export class AuthModule { }
