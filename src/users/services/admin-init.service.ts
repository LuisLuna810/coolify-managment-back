import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users.service';

@Injectable()
export class AdminInitService {
  private readonly logger = new Logger(AdminInitService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async initializeAdminUser(): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');
    const adminUsername = this.configService.get<string>('ADMIN_USERNAME');

    // Si no están definidas las variables de entorno, no hacemos nada
    if (!adminEmail || !adminPassword || !adminUsername) {
      this.logger.log('Variables de entorno ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_USERNAME no están definidas. Saltando creación de usuario admin.');
      return;
    }

    try {
      // Verificar si el usuario admin ya existe
      const existingAdmin = await this.usersService.findByEmail(adminEmail);
      
      if (existingAdmin) {
        this.logger.log(`Usuario admin con email ${adminEmail} ya existe. Saltando creación.`);
        return;
      }

      // Crear el usuario admin
      const adminUser = await this.usersService.create({
        email: adminEmail,
        password: adminPassword,
        username: adminUsername,
        role: 'admin',
        isActive: true,
      });

      this.logger.log(`✅ Usuario admin creado exitosamente: ${adminUser.email} (${adminUser.username})`);
    } catch (error) {
      this.logger.error(`❌ Error al crear usuario admin: ${error.message}`, error.stack);
    }
  }
}