# 1. Etapa de build
FROM node:22-alpine AS build

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del proyecto
COPY . .

# Generar build de producción
RUN npm run build

# 2. Etapa de servidor
FROM nginx:alpine

# Crear usuario y grupo no root
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copiar el build generado a la carpeta de Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Cambiar permisos de la carpeta
RUN chown -R appuser:appgroup /usr/share/nginx/html

# Cambiar al usuario no root
USER appuser

# Exponer el puerto
EXPOSE 80

# Comando por defecto
CMD ["nginx", "-g", "daemon off;"]
