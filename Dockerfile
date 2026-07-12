# Imagen de Nogui CRM para correr en un servidor local (Docker + PostgreSQL).
# Dos etapas: build (compila) y runner (solo lo necesario para ejecutar).

# ── Etapa 1: build ────────────────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app

# Prisma necesita openssl para su motor de consultas
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Dependencias. Se resuelven DENTRO del contenedor (Linux) en vez de reutilizar
# el package-lock.json del Mac: ese lock trae binarios opcionales de sharp de otra
# plataforma con versión vacía que rompen `npm ci` en Linux (bug conocido de npm).
# La app no usa next/image, así que sharp no hace falta.
COPY package.json ./
RUN npm install --no-audit --no-fund

# Código
COPY . .

# Esquema PostgreSQL derivado + cliente Prisma + compilación de Next
RUN npm run gen:prod-schema \
 && npx prisma generate --schema=prisma/schema.postgres.prisma \
 && npm run build

# ── Etapa 2: runner ───────────────────────────────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copiamos la app ya compilada con sus dependencias y el cliente Prisma generado
COPY --from=builder /app ./

EXPOSE 3000

# El entrypoint crea/actualiza las tablas y siembra datos la primera vez,
# luego arranca el servidor de Next.
ENTRYPOINT ["bash", "docker-entrypoint.sh"]
