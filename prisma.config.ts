import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: la URL de conexión para comandos de CLI (db push, migrate, studio)
// vive aquí, no en schema.prisma. El cliente en tiempo de ejecución usa su
// propio "adapter" (ver src/lib/prisma.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
