# Sistema Mao - Modulo de Notas de Entrega (MVP)

## Que es esto
Primera version funcional (bloque Must del PRD) de la pantalla de "Nueva nota":
buscar producto con tolerancia a errores, agregar cantidad, editar precio,
aplicar descuento, ver total, y guardar la nota en Supabase.

## Antes de correrlo

1. En tu proyecto de Supabase, ve a **SQL Editor** y corre (si aun no lo hiciste)
   el contenido de `schema.sql` (ya lo hiciste) y luego el de `sql/functions.sql`
   (nuevo, corre este ahora).
2. En Supabase ve a **Project Settings > API** y copia:
   - `Project URL`
   - `anon public key`
3. Copia el archivo `.env.local.example` a un nuevo archivo llamado `.env.local`
   y pega ahi esos dos valores.

## Correr en tu computadora (para probarlo)

```
npm install
npm run dev
```

Abre `http://localhost:3000` en el navegador. Desde el panel, entra a "Nueva nota".

## Subir a GitHub y publicar (Cloudflare Pages)

1. Sube esta carpeta a un repositorio nuevo en tu cuenta de GitHub.
2. En Cloudflare Pages, crea un proyecto conectado a ese repositorio.
   - Build command: `npm run build`
   - Output directory: `.next`
3. En la configuracion del proyecto en Cloudflare, agrega las mismas dos
   variables de entorno (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## Que falta (pendiente, segun el PRD)

- Descargar/imprimir la nota en PDF (Must, siguiente paso).
- Exportar notas a Excel (Must).
- Login de usuario (Must).
- Conversion de moneda Bs/COP, niveles de precio 1-4, logo (Should).
- Dashboard con menu lateral y reportes (Could).
