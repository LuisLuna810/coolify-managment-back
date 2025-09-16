# Guía para Crear y Subir Imagen Docker

Este documento explica cómo crear una imagen Docker del proyecto **coolify-management-back** y subirla a un registry.

## Prerrequisitos

- Docker instalado y funcionando
- Acceso a un registry Docker (Docker Hub, GitLab Registry, etc.)
- Node.js 22+ (para desarrollo local)

## Archivos Incluidos

### Dockerfiles Disponibles

1. **`Dockerfile`** - Original multi-stage con desarrollo y producción
2. **`Dockerfile.optimized`** - Versión optimizada con mejor manejo de errores
3. **`Dockerfile.simple`** - Versión simple usando dist pre-construido
4. **`Dockerfile.prod`** - Versión mínima para producción

### Scripts de Automatización

- **`scripts/build-image.sh`** - Script para construir y subir imágenes
- **`scripts/run-local.sh`** - Script para ejecutar la imagen localmente
- **`docker-compose.yml`** - Configuración completa con base de datos

## Método 1: Usando Scripts Automatizados

### 1. Construir imagen local

```bash
# Construir con tag 'latest'
./scripts/build-image.sh

# Construir con tag específico
./scripts/build-image.sh v1.0.0

# Construir y subir al registry
./scripts/build-image.sh v1.0.0 your-registry.com
```

### 2. Ejecutar localmente

```bash
# Ejecutar imagen local
./scripts/run-local.sh

# Ejecutar con tag específico
./scripts/run-local.sh v1.0.0

# Ejecutar con archivo de entorno personalizado
./scripts/run-local.sh latest .env.production
```

## Método 2: Comandos Docker Manuales

### 1. Preparar el código

```bash
# Construir la aplicación
npm install
npm run build
```

### 2. Construir la imagen

```bash
# Usando Dockerfile original (recomendado)
docker build --target production -t coolify-management-back:latest .

# Usando Dockerfile simple (más rápido)
docker build -f Dockerfile.simple -t coolify-management-back:latest .
```

### 3. Probar la imagen localmente

```bash
# Ejecutar contenedor
docker run -d \
  --name coolify-test \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_USER=postgres \
  -e DB_PASS=password \
  -e DB_NAME=coolify_management \
  coolify-management-back:latest

# Ver logs
docker logs -f coolify-test

# Probar health check
curl http://localhost:3000/health
```

### 4. Subir al registry

```bash
# Tag para registry
docker tag coolify-management-back:latest your-registry.com/coolify-management-back:latest

# Login al registry
docker login your-registry.com

# Subir imagen
docker push your-registry.com/coolify-management-back:latest
```

## Método 3: Usando Docker Compose (Desarrollo)

```bash
# Levantar todo el stack (app + base de datos + redis)
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Detener
docker-compose down
```

## Configuración de Variables de Entorno

### Variables Requeridas

```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=your-password
DB_NAME=coolify_management

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key

# CORS
CORS_ORIGIN=http://localhost:3001

# Puerto (opcional, default: 3000)
PORT=3000
```

### Variables Opcionales (Usuario Admin)

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_USERNAME=admin
```

## Registries Populares

### Docker Hub

```bash
# Tag y subir a Docker Hub
docker tag coolify-management-back:latest username/coolify-management-back:latest
docker push username/coolify-management-back:latest
```

### GitLab Registry

```bash
# Tag y subir a GitLab
docker tag coolify-management-back:latest registry.gitlab.com/username/project:latest
docker push registry.gitlab.com/username/project:latest
```

### GitHub Container Registry

```bash
# Tag y subir a GitHub
docker tag coolify-management-back:latest ghcr.io/username/coolify-management-back:latest
docker push ghcr.io/username/coolify-management-back:latest
```

## Troubleshooting

### Error de npm en Docker

Si encuentras errores de npm durante el build:

1. Usar Dockerfile simple con dist pre-construido
2. Verificar conexión a internet en Docker
3. Usar `npm install` en lugar de `npm ci`

### Error de permisos

```bash
# Asegurar permisos correctos
chmod +x scripts/*.sh
```

### Error de conexión a base de datos

1. Verificar variables de entorno
2. Asegurar que la base de datos esté accesible
3. Usar docker-compose para desarrollo local

### Health check falla

1. Verificar que el endpoint `/health` existe
2. Verificar que la aplicación esté corriendo en el puerto correcto
3. Revisar logs del contenedor

## Próximos Pasos

1. **CI/CD**: Integrar con GitHub Actions o GitLab CI
2. **Monitoring**: Agregar métricas y logs estructurados
3. **Security**: Escanear vulnerabilidades en la imagen
4. **Optimization**: Reducir tamaño de imagen con multi-stage builds