import "./env";
import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client. In dev, Next.js hot-reload re-imports modules, which
 * would otherwise spawn a new pool of connections on every reload; cache the
 * client on `globalThis` to keep a single instance.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
