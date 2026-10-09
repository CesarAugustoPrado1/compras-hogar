# Compras Hogar

Asistente de compras para el hogar: registrar lo que compramos, que nunca falte nada, gastar lo mínimo y automatizar todo lo posible.

Ver [OBJETIVOS.md](./OBJETIVOS.md) para la visión, los objetivos y los módulos del proyecto.

## Stack

Next.js 16 (App Router) · Tailwind · Drizzle ORM · Neon (Postgres) · despliegue en Vercel.

## Puesta en marcha (sin instalar nada, todo en Vercel)

1. **Vercel → Add New → Project**: importar este repo de GitHub. Framework: Next.js; el resto, por defecto.
2. **Variables** (*Settings → Environment Variables*):
   - `SESSION_SECRET`: una cadena larga al azar (ver abajo).
   - `ANTHROPIC_API_KEY`: API key de Claude (console.anthropic.com → API Keys).
3. **Base de datos** (*Storage → Connect Database → Neon*): conectar la base de Neon. Esto completa `DATABASE_URL` solo. Si ya tenés la base creada en Neon, podés pegar su cadena de conexión como variable `DATABASE_URL`.
4. **Fotos** (*Storage → Create → Blob*): crear un Blob store y conectarlo al proyecto. Esto completa `BLOB_READ_WRITE_TOKEN`.
5. **Redeploy** (*Deployments → ⋯ → Redeploy*) para que tome las variables. En cada build se crean o actualizan las tablas solas (`scripts/migrate.ts`).
6. Abrir la URL de la app: la primera vez pide crear tu usuario y PIN. Después, en **Usuarios**, se agrega al resto de la familia.

`SESSION_SECRET` se puede generar con `openssl rand -base64 32`, o en cualquier generador de contraseñas largas (40+ caracteres).

### Desarrollo local (opcional)

`npm install`, copiar `.env.example` a `.env`, completar y `npm run dev`. Sin `BLOB_READ_WRITE_TOKEN` las fotos se guardan en `.uploads/`. `npm run db:migrate` aplica las migraciones; `npm run user:set -- <nombre> <pin>` crea un usuario o le cambia el PIN.

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
