#!/bin/bash

# Script para construir y subir imagen Docker al registry
# Uso: ./scripts/build-image.sh [TAG] [REGISTRY]

set -e

# Configuración por defecto
DEFAULT_TAG="latest"
DEFAULT_REGISTRY=""
APP_NAME="coolify-management-back"

# Obtener parámetros
TAG=${1:-$DEFAULT_TAG}
REGISTRY=${2:-$DEFAULT_REGISTRY}

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Construyendo imagen Docker para $APP_NAME${NC}"

# Función para mostrar ayuda
show_help() {
    echo "Uso: $0 [TAG] [REGISTRY]"
    echo ""
    echo "Parámetros:"
    echo "  TAG       - Tag de la imagen (default: latest)"
    echo "  REGISTRY  - Registry donde subir la imagen (opcional)"
    echo ""
    echo "Ejemplos:"
    echo "  $0                              # Construir con tag 'latest'"
    echo "  $0 v1.0.0                      # Construir con tag 'v1.0.0'"
    echo "  $0 v1.0.0 registry.example.com # Construir y subir al registry"
    echo ""
}

# Verificar si se pidió ayuda
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# Construir nombre completo de la imagen
if [[ -n "$REGISTRY" ]]; then
    FULL_IMAGE_NAME="$REGISTRY/$APP_NAME:$TAG"
else
    FULL_IMAGE_NAME="$APP_NAME:$TAG"
fi

echo -e "${YELLOW}📦 Imagen: $FULL_IMAGE_NAME${NC}"

# Verificar que estamos en el directorio correcto
if [[ ! -f "package.json" ]]; then
    echo -e "${RED}❌ Error: package.json no encontrado. Ejecuta desde la raíz del proyecto.${NC}"
    exit 1
fi

# Preparar aplicación (build local)
echo -e "${GREEN}🔨 Preparando aplicación...${NC}"
if [[ ! -d "dist" ]]; then
    echo -e "${YELLOW}📦 Construyendo aplicación localmente...${NC}"
    npm install
    npm run build
fi

# Construir la imagen (usar Dockerfile original con production target)
echo -e "${GREEN}🔨 Construyendo imagen Docker...${NC}"
docker build --target production -t "$FULL_IMAGE_NAME" .

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Imagen construida exitosamente: $FULL_IMAGE_NAME${NC}"
else
    echo -e "${RED}❌ Error al construir la imagen${NC}"
    echo -e "${YELLOW}💡 Intentando con Dockerfile simple...${NC}"
    
    # Fallback: usar Dockerfile simple si el multi-stage falla
    docker build -f Dockerfile.simple -t "$FULL_IMAGE_NAME" . || {
        echo -e "${RED}❌ Error: No se pudo construir la imagen${NC}"
        exit 1
    }
fi

# Mostrar información de la imagen
echo -e "${GREEN}📊 Información de la imagen:${NC}"
docker images "$FULL_IMAGE_NAME"

# Subir al registry si se especificó
if [[ -n "$REGISTRY" ]]; then
    echo -e "${GREEN}📤 Subiendo imagen al registry...${NC}"
    docker push "$FULL_IMAGE_NAME"
    
    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✅ Imagen subida exitosamente al registry${NC}"
    else
        echo -e "${RED}❌ Error al subir la imagen al registry${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}ℹ️  Para subir al registry, ejecuta:${NC}"
    echo -e "${YELLOW}   docker push $FULL_IMAGE_NAME${NC}"
fi

echo -e "${GREEN}🎉 ¡Proceso completado!${NC}"
echo -e "${GREEN}🐳 Para ejecutar la imagen:${NC}"
echo -e "${GREEN}   docker run -p 3000:3000 $FULL_IMAGE_NAME${NC}"