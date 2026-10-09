# Compras Hogar

Asistente de compras para el hogar: registrar lo que compramos, que nunca falte nada, gastar lo mínimo y automatizar todo lo posible.

Ver [OBJETIVOS.md](./OBJETIVOS.md) para la visión, los objetivos y los módulos del proyecto.

## Stack

Next.js 16 (App Router) · Tailwind · Drizzle ORM · Neon (Postgres) · despliegue en Vercel.

## Puesta en marcha

1. Instalar dependencias: `npm install`
2. Copiar `.env.example` a `.env` y completar:
   - `DATABASE_URL`: cadena de conexión de Neon.
   - `SESSION_SECRET`: `openssl rand -base64 32`
   - `ANTHROPIC_API_KEY`: API key de Claude (console.anthropic.com), para leer los tickets.
   - `BLOB_READ_WRITE_TOKEN`: opcional en local. Sin él, las fotos se guardan en `.uploads/`.
3. Crear las tablas: `npm run db:migrate`
4. Cargar los supermercados iniciales (Coto, El Abastecedor): `npm run db:seed`
5. Crear los usuarios (PIN de 4 a 8 dígitos):
   ```
   npm run user:set -- Cesar 1234
   npm run user:set -- <nombre> <pin>
   ```
   El mismo comando sirve para cambiar un PIN.
6. Levantar la app: `npm run dev` → http://localhost:3000

## Acceso

Cada persona elige su nombre y entra con su PIN. Después de 5 intentos fallidos el usuario queda bloqueado 15 minutos. La sesión dura 30 días.

## Módulo 1: tickets

1. **Cargar** (`/tickets/nuevo`): una o varias fotos del ticket, en orden. El navegador las achica antes de subirlas.
2. **Leer**: Claude (`claude-opus-5-5`, configurable con `ANTHROPIC_MODEL`) extrae supermercado, fecha, total, medio de pago y cada renglón: texto original, EAN si está impreso, cantidad, precios, descuentos, y una propuesta de producto normalizado (nombre, marca, presentación, categoría). Si la lectura falla, el ticket queda igual con sus fotos para reintentar o cargarlo a mano.
3. **Reconocer**: cada renglón se vincula a un producto ya conocido, primero por EAN y si no por cómo lo nombra ese supermercado.
4. **Validar** (`/tickets/[id]`): se revisa contra la foto, con control de que la suma de renglones dé el total. Al validar se crean o actualizan los productos y se guarda el alias para que la próxima vez salga solo.

Las fotos se guardan en Vercel Blob **privado** y solo se ven con sesión iniciada (`/fotos/...`).

## Base de datos

El esquema está en `src/db/schema.ts`. Al cambiarlo: `npm run db:generate` (crea la migración en `drizzle/`) y `npm run db:migrate`.

| Tabla | Para qué |
|-------|----------|
| `users` | Usuarios del hogar (nombre + PIN). |
| `stores` | Supermercados. |
| `products` | Producto canónico, identificado por EAN-13/GTIN cuando existe. |
| `product_aliases` | Cómo llama cada supermercado a un producto en el ticket; se aprende de las validaciones. |
| `tickets` | Ticket de compra (súper, fecha, total, estado borrador/validado, quién lo cargó y quién lo validó). |
| `ticket_images` | Fotos del ticket, en orden (uno largo puede ser varias fotos). |
| `ticket_items` | Renglones del ticket, con el texto original y el producto normalizado. |
