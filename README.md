# Solar App (MVP)

Este proyecto es un prototipo de aplicación web estática para cálculos de instalación de paneles solares.  
Se construye con **Vite (JS vanilla)** y se despliega en un contenedor **Docker** usando **Nginx**.

---

## 🚀 Requisitos

- [Node.js](https://nodejs.org/) >= 18 (solo para el build local)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

---

## 🛠️ Desarrollo local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Levantar servidor de desarrollo:
   ```bash
   npm run dev
   ```

3. Abrir en el navegador:
   ```
   http://localhost:5173
   ```

---

## 🐳 Deploy con Docker

### Construcción de la imagen
```bash
docker build -t solar-app .
```

### Ejecución del contenedor
```bash
docker run -d -p 8081:80 solar-app
```

Abrir en el navegador:
```
http://localhost:8081
```

---

## 📦 Deploy con Docker Compose

1. Levantar el servicio:
   ```bash
   docker-compose up --build -d
   ```

2. Verificar que el contenedor está corriendo:
   ```bash
   docker ps
   ```

3. Acceder a la aplicación:
   ```
   http://localhost:8081
   ```

---

## 🔧 Notas

- No se requiere persistencia de datos (no hay volúmenes).  
- El contenedor corre con un usuario no root por seguridad.  
- Para producción futura se puede añadir un proxy reverso (ej. Traefik o Nginx personalizado).  

---