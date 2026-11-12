import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

// Prisma 7 requiere un "adapter" explícito para conectarse a la base de datos
// (ya no basta con la URL en schema.prisma). Para SQLite usamos better-sqlite3.
const dbPath = path.join(process.cwd(), "data", "db", "clipai.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });

// En desarrollo, Next.js recarga módulos — guardamos el cliente en globalThis
// para no abrir una conexión nueva a la base de datos en cada recarga.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
