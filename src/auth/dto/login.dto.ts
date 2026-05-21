import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'La contraseña es muy corta' })
  @MaxLength(200)
  password: string;
}
