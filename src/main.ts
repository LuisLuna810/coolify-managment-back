import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { randomUUID } from 'crypto';
import { AdminInitService } from './users/services/admin-init.service';
import type { NestExpressApplication } from '@nestjs/platform-express';

// Validar envs críticas al boot. Si falta alguna, mejor crashear que arrancar
// con valores inseguros como JWT_SECRET='secretKey'.
function assertRequiredEnv() {
  const logger = new Logger('Bootstrap');
  const required = ['JWT_SECRET', 'DB_PASS', 'DB_USER', 'DB_NAME', 'DB_HOST'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'secretKey' || (process.env.JWT_SECRET || '').length < 16) {
    logger.error('JWT_SECRET es muy débil. Configurá uno >=16 caracteres aleatorios.');
    process.exit(1);
  }
}

async function bootstrap() {
  assertRequiredEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ETag default genera respuestas 304 en /auth/me y rompe la validación de token
  // tras login (axios no recibe body en algunos navegadores).
  app.set('etag', false);

  app.use(cookieParser());

  // Correlation ID por request para poder trackear logs end-to-end
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const id = Array.isArray(incoming) ? incoming[0] : incoming || randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  morgan.token('reqid', (req: any) => req.id || '-');
  app.use(
    morgan(':reqid :method :url :status :res[content-length] - :response-time ms'),
  );

  // Forzar no-store en endpoints de auth para evitar cualquier cache intermedio.
  app.use((req, res, next) => {
    if (req.path.startsWith('/auth')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Inicializar usuario admin si las variables de entorno están configuradas
  const adminInitService = app.get(AdminInitService);
  await adminInitService.initializeAdminUser();

  const config = new DocumentBuilder()
    .setTitle('Coolify Management API Docs')
    .setDescription('API para gestionar usuarios, proyectos y acciones sobre Coolify')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  app.use('/api-docs', (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
  });

  // CORS_ORIGIN puede venir como CSV: "https://app.example.com,http://localhost:3001"
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  SwaggerModule.setup('api-docs', app, document);

  // Whitelist + forbidNonWhitelisted: descartar campos extra en bodies.
  // Transform: convertir tipos primitivos (e.g. string a number en query params).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
