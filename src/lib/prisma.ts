import { PrismaClient } from "@prisma/client";

// En desarrollo, Next.js recarga módulos — guardamos el cliente en globalThis
// para no abrir una conexión nueva a la base de datos en cada recarga.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
