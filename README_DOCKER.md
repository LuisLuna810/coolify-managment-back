# 🐳 Instrucciones para Crear Imagen Docker

Este proyecto ahora incluye toda la infraestructura necesaria para crear y desplegar una imagen Docker del backend de Coolify Management.

## 📋 Resumen de Cambios Realizados

### ✅ Problemas Solucionados
- **Fixed:** Error de compilación TypeScript (LogsModule faltante)
- **Added:** Scripts automatizados para build y deploy
- **Added:** Múltiples configuraciones de Dockerfile
- **Added:** Docker Compose para desarrollo
- **Added:** GitHub Actions para CI/CD automatizado
- **Added:** Documentación completa

### 📂 Archivos Creados

```
├── .github/workflows/
│   └── docker-build.yml          # CI/CD automatizado
├── scripts/
│   ├── build-image.sh            # Script de construcción
│   └── run-local.sh              # Script ejecución local
├── Dockerfile                    # Original (multi-stage)
├── Dockerfile.optimized          # Versión optimizada
├── Dockerfile.simple             # Versión simple
├── Dockerfile.prod               # Solo producción
├── docker-compose.yml            # Stack completo
└── DOCKER_GUIDE.md              # Guía detallada
```

## 🚀 Uso Rápido

### Opción 1: Script Automatizado (Recomendado)

```bash
# Construir imagen local
./scripts/build-image.sh

# Construir con tag específico
./scripts/build-image.sh v1.0.0

# Construir y subir al registry
./scripts/build-image.sh v1.0.0 your-registry.com
```

### Opción 2: Docker Manual

```bash
# 1. Preparar aplicación
npm install
npm run build

# 2. Construir imagen
docker build --target production -t coolify-management-back:latest .

# 3. Ejecutar localmente
docker run -d -p 3000:3000 \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_USER=postgres \
  -e DB_PASS=password \
  -e DB_NAME=coolify_management \
  coolify-management-back:latest

# 4. Subir al registry
docker tag coolify-management-back:latest your-registry.com/app:latest
docker push your-registry.com/app:latest
```

### Opción 3: Docker Compose (Desarrollo)

```bash
# Levantar todo (app + PostgreSQL + Redis)
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Acceder a la app: http://localhost:3000
# API Docs: http://localhost:3000/api-docs
```

## 🔧 Variables de Entorno Requeridas

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

# Admin user (opcional)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_USERNAME=admin
```

## 🏗️ CI/CD Automatizado

El proyecto incluye GitHub Actions que automáticamente:

1. **Build:** Construye la aplicación en cada push
2. **Test:** Ejecuta pruebas
3. **Docker:** Crea imagen Docker
4. **Push:** Sube al GitHub Container Registry
5. **Tag:** Maneja versioning automático

### Configurar CI/CD

1. El workflow ya está configurado en `.github/workflows/docker-build.yml`
2. Se ejecuta automáticamente en push a `main` o `develop`
3. Las imágenes se publican en: `ghcr.io/luisluna810/coolify-managment-back`

### Usar imagen del registry

```bash
# Pull imagen desde GitHub Container Registry
docker pull ghcr.io/luisluna810/coolify-managment-back:latest

# Ejecutar
docker run -d -p 3000:3000 \
  --env-file .env \
  ghcr.io/luisluna810/coolify-managment-back:latest
```

## 📚 Registries Soportados

### GitHub Container Registry (Incluido)
```bash
docker tag coolify-management-back:latest ghcr.io/luisluna810/coolify-managment-back:latest
docker push ghcr.io/luisluna810/coolify-managment-back:latest
```

### Docker Hub
```bash
docker tag coolify-management-back:latest username/coolify-management-back:latest
docker push username/coolify-management-back:latest
```

### Otros Registries
```bash
# GitLab
docker tag coolify-management-back:latest registry.gitlab.com/user/project:latest

# AWS ECR
docker tag coolify-management-back:latest 123456789.dkr.ecr.region.amazonaws.com/repo:latest

# Azure Container Registry
docker tag coolify-management-back:latest myregistry.azurecr.io/app:latest
```

## 🔍 Verificación

### Health Check
```bash
curl http://localhost:3000/health
```

### Logs del Contenedor
```bash
docker logs -f container-name
```

### Conectar a Base de Datos
```bash
# Si usas docker-compose
docker-compose exec postgres psql -U postgres -d coolify_management
```

## 🐛 Troubleshooting

### Error de npm en Docker build
**Solución:** Usar Dockerfile.simple con dist pre-construido:
```bash
npm run build
docker build -f Dockerfile.simple -t app:latest .
```

### Error de conexión a BD
**Solución:** Verificar variables de entorno y conectividad:
```bash
docker run --rm -it --entrypoint sh coolify-management-back:latest
# Dentro del contenedor: env | grep DB_
```

### Permisos de scripts
```bash
chmod +x scripts/*.sh
```

## 📈 Próximos Pasos

1. **🔐 Security:** Agregar escaneo de vulnerabilidades
2. **📊 Monitoring:** Integrar métricas (Prometheus)
3. **🔄 Auto-deploy:** Configurar deploy automático a staging
4. **📦 Optimization:** Reducir tamaño de imagen
5. **🧪 Testing:** Agregar tests de integración

## 📞 Soporte

Para problemas o dudas:
1. Revisar `DOCKER_GUIDE.md` para detalles completos
2. Verificar logs del contenedor
3. Crear issue en el repositorio

¡La imagen Docker está lista para ser usada en producción! 🎉