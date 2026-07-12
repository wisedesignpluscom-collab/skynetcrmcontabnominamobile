#!/usr/bin/env bash
# Arranque del contenedor de la app:
#  1. Espera a que PostgreSQL acepte conexiones.
#  2. Crea/actualiza las tablas (prisma db push).
#  3. Siembra usuarios + datos demo SOLO si la base está vacía (no pisa datos reales).
#  4. Arranca el servidor de Next.
set -e

SCHEMA="prisma/schema.postgres.prisma"

echo "⏳ Esperando a la base de datos…"
for i in $(seq 1 30); do
  if node scripts/count-users.mjs >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "🗄️  Aplicando el esquema a la base de datos…"
npx prisma db push --schema="$SCHEMA" --skip-generate

USERS="$(node scripts/count-users.mjs 2>/dev/null || echo 0)"
if [ "$USERS" = "0" ]; then
  echo "🌱 Base vacía: sembrando usuarios y datos de ejemplo…"
  npx tsx prisma/seed-users.ts
  npx tsx prisma/seed.ts
  npx tsx prisma/seed-rules.ts
else
  echo "✓ La base ya tiene datos ($USERS usuarios): no se siembra nada."
fi

echo "🚀 Iniciando Nogui CRM…"
exec npm start
