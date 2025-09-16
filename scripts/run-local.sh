#!/bin/bash

# Script para ejecutar la imagen Docker localmente
# Uso: ./scripts/run-local.sh [TAG] [ENV_FILE]

set -e

# Configuración por defecto
DEFAULT_TAG="latest"
DEFAULT_ENV_FILE=".env"
APP_NAME="coolify-management-back"

# Obtener parámetros
TAG=${1:-$DEFAULT_TAG}
ENV_FILE=${2:-$DEFAULT_ENV_FILE}

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Ejecutando $APP_NAME:$TAG localmente${NC}"

# Verificar si la imagen existe
if ! docker images "$APP_NAME:$TAG" | grep -q "$TAG"; then
    echo -e "${RED}❌ Error: La imagen $APP_NAME:$TAG no existe${NC}"
    echo -e "${YELLOW}💡 Construye la imagen primero con: ./scripts/build-image.sh $TAG${NC}"
    exit 1
fi

# Configurar variables de entorno
ENV_ARGS=""
if [[ -f "$ENV_FILE" ]]; then
    echo -e "${GREEN}📄 Usando archivo de entorno: $ENV_FILE${NC}"
    ENV_ARGS="--env-file $ENV_FILE"
else
    echo -e "${YELLOW}⚠️  Archivo $ENV_FILE no encontrado, usando variables de entorno del sistema${NC}"
fi

# Nombre del contenedor
CONTAINER_NAME="$APP_NAME-local"

# Detener contenedor existente si está corriendo
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo -e "${YELLOW}🛑 Deteniendo contenedor existente...${NC}"
    docker stop "$CONTAINER_NAME"
fi

# Remover contenedor existente si existe
if docker ps -aq -f name="$CONTAINER_NAME" | grep -q .; then
    echo -e "${YELLOW}🗑️  Removiendo contenedor existente...${NC}"
    docker rm "$CONTAINER_NAME"
fi

# Ejecutar contenedor
echo -e "${GREEN}🐳 Iniciando contenedor...${NC}"
docker run -d \
    --name "$CONTAINER_NAME" \
    -p 3000:3000 \
    $ENV_ARGS \
    "$APP_NAME:$TAG"

# Verificar que el contenedor esté corriendo
sleep 2
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo -e "${GREEN}✅ Contenedor iniciado exitosamente${NC}"
    echo -e "${GREEN}🌐 Aplicación disponible en: http://localhost:3000${NC}"
    echo -e "${GREEN}📊 API Docs disponible en: http://localhost:3000/api-docs${NC}"
    echo -e "${GREEN}❤️  Health Check: http://localhost:3000/health${NC}"
    echo ""
    echo -e "${YELLOW}📋 Comandos útiles:${NC}"
    echo -e "${YELLOW}   Ver logs:     docker logs -f $CONTAINER_NAME${NC}"
    echo -e "${YELLOW}   Detener:      docker stop $CONTAINER_NAME${NC}"
    echo -e "${YELLOW}   Reiniciar:    docker restart $CONTAINER_NAME${NC}"
    echo -e "${YELLOW}   Remover:      docker rm -f $CONTAINER_NAME${NC}"
else
    echo -e "${RED}❌ Error: El contenedor no pudo iniciarse${NC}"
    echo -e "${YELLOW}📋 Ver logs con: docker logs $CONTAINER_NAME${NC}"
    exit 1
fi