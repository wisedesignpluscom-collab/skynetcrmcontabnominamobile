# Migraciones de base de datos

Guía corta para cambiar el esquema sin perder los datos del cliente.

## Por qué existe esto

Hasta ahora el proyecto usaba `prisma db push`: sincroniza la base con el
esquema, pero **sin historial**. Sirve para desarrollo (la base local es
descartable) y es peligroso en casa del cliente: no hay forma de saber qué
versión tiene instalada, ni de aplicar solo lo que falta, ni de revisar qué SQL
se va a ejecutar antes de correrlo.

Desde ahora, el servidor del cliente se actualiza con **migraciones
versionadas**: archivos SQL numerados que se aplican una sola vez y quedan
registrados en la tabla `_prisma_migrations`.

## Cómo está montado

| Entorno | Motor | Cómo se actualiza |
|---|---|---|
| Desarrollo (tu Mac) | SQLite (`prisma/dev.db`) | `npx prisma db push` — la base local es descartable |
| Servidor del cliente | PostgreSQL | `npm run db:aplicar` — migraciones versionadas |

Las migraciones de `prisma/migrations/` son **de PostgreSQL**, que es el motor de
producción. El desarrollo sigue en SQLite porque las pruebas trabajan sobre
copias del archivo, lo que las hace rápidas y aisladas.

`prisma/baseline/schema.migrada.prisma` es la foto del esquema tal como quedó en
la última migración. **Se commitea**: es lo que permite generar la siguiente
migración comparando dos archivos de texto, sin necesidad de tener PostgreSQL
levantado.

## Uso diario

### 1. Cambiaste el esquema y quieres una migración

```bash
npm run db:migracion "agrega tabla de recibos"
```

Genera `prisma/migrations/<fecha>_agrega_tabla_de_recibos/migration.sql` y
actualiza la foto del esquema. **No necesita ninguna base de datos.**

Si el SQL contiene `DROP TABLE`, `DROP COLUMN` o `ALTER COLUMN`, el script avisa:
esos comandos **borran datos del cliente**. Revisa el archivo a mano y, si hace
falta, agrégale los pasos para conservar lo existente antes de borrar.

Si no hay cambios pendientes, no crea nada y lo dice.

### 2. Ver qué le falta al servidor del cliente

```bash
npm run db:estado
```

### 3. Aplicar las migraciones en el servidor

```bash
npm run db:aplicar
```

Aplica solo las que falten y regenera el cliente de Prisma. Es el comando que
corre el instalador al actualizar.

### 4. Instalación desde cero

```bash
npm run setup:prod-db        # migraciones + usuarios, reglas, obligaciones y catálogos
npm run setup:prod-db:demo   # lo anterior + datos de demostración
```

## Variables de entorno

```
DATABASE_URL=postgresql://usuario:clave@localhost:5432/skynet_crm?schema=public&connection_limit=20
DIRECT_URL=postgresql://usuario:clave@localhost:5432/skynet_crm?schema=public
```

- `DIRECT_URL` existe porque en la nube (Supabase) `DATABASE_URL` apunta a un
  *pooler* que no sirve para migrar. **En un servidor local, ponle el mismo valor
  que `DATABASE_URL`.**
- `connection_limit` en la URL controla el pool de Prisma. Para ~30 usuarios
  concurrentes, 20 es un buen punto de partida; PostgreSQL admite 100 conexiones
  por defecto.

## Caso especial: una base que ya existe y se creó con `db push`

Si el cliente (o el despliegue en la nube) ya tiene las tablas creadas sin
historial de migraciones, hay que decirle a Prisma que la primera migración ya
está aplicada, en vez de intentar recrear todo:

```bash
npx prisma migrate resolve --applied 20260727000000_estado_inicial --schema=prisma/schema.postgres.prisma
```

A partir de ahí, `npm run db:aplicar` funciona normal.

## Antes de tocar la base de un cliente

1. **Backup primero.** `pg_dump` completo, verificado, antes de cualquier
   actualización. Sin excepción.
2. Lee el SQL de las migraciones que se van a aplicar (`npm run db:estado` te
   dice cuáles son).
3. Si alguna borra datos, prueba la actualización sobre una copia del backup
   antes de correrla en producción.

## Verificación hecha

El flujo se probó de punta a punta contra un PostgreSQL 16 real:

- La migración inicial crea las 31 tablas y deja **cero diferencias** con el
  modelo (`migrate diff` contra la base ya migrada devuelve vacío).
- Con datos cargados, dos migraciones sucesivas se aplicaron de forma
  incremental y **los registros existentes sobrevivieron**.
- La aplicación completa arrancó contra PostgreSQL: login, dashboard y el motor
  de vencimientos fiscales se comportan igual que sobre SQLite.
