# Clip-AI

Detecta momentos con potencial y genera clips cortos automáticamente a partir de video
grabado, transmisiones en vivo o grabaciones hechas con el teléfono.

## Puesta en marcha (primera vez)

```bash
npm install
cp .env.example .env.local   # luego edita .env.local y coloca tus claves reales
npx prisma generate
npx prisma db push           # crea el archivo de base de datos en data/db/clipai.db
npm run dev
```

Abre `http://localhost:3000`.

## Estructura

- `src/app` — páginas y rutas de la API (Next.js App Router)
- `src/components` — componentes de interfaz
- `src/lib` — utilidades compartidas (base de datos, almacenamiento, tipos)
- `prisma/schema.prisma` — modelo de datos
- `data/` — archivos generados por el usuario (videos originales, clips, miniaturas, base
  de datos). No se sube a git.

## Estado del proyecto

Esta aplicación se construye en etapas, cada una con procesamiento real verificado antes
de pasar a la siguiente. Lo que todavía no está conectado se marca explícitamente como
"Pendiente" en la interfaz — nunca se simulan resultados.
