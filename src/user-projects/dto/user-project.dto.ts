import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class PermissionsDto {
  @IsOptional()
  @IsBoolean()
  canStart?: boolean;

  @IsOptional()
  @IsBoolean()
  canStop?: boolean;

  @IsOptional()
  @IsBoolean()
  canRestart?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessEnvs?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessLogs?: boolean;
}

export class AssignProjectDto extends PermissionsDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;
}
