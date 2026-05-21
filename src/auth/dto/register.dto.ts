import { IsEmail, IsString, IsIn, MinLength, MaxLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(200)
  password: string;

  @IsIn(['admin', 'developer'], { message: 'El role debe ser admin o developer' })
  role: 'admin' | 'developer';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;
}

export class RegisterDeveloperDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(200)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  username: string;
}
