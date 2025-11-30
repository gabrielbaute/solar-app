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

# Crear y dar permisos a los directorios de cache
RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx && \
    chown -R appuser:appgroup /var/cache/nginx /var/run /var/log/nginx

# Copiar archivos de configuración personalizados de Nginx
COPY nginx.conf /etc/nginx/nginx.conf
RUN chown appuser:appgroup /etc/nginx/nginx.conf

COPY --from=build /app/dist /usr/share/nginx/html
RUN chown -R appuser:appgroup /usr/share/nginx/html

# Cambiar al usuario no root
USER appuser

# Exponer el puerto
EXPOSE 8081

# Comando por defecto
CMD ["nginx", "-g", "daemon off;"]
