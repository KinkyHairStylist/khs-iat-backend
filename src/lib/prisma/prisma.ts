import { PrismaClient, Prisma } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getServiceLogger } from "../../utils/loggerCreator";
import { NODE_ENV, DATABASE_URL } from "../../config/env";

const logger = getServiceLogger("prisma");

const needsSsl =
  DATABASE_URL.includes("sslmode=require") ||
  process.env.DB_SSL === "require" ||
  process.env.DB_SSL === "true";
const normalizedDatabaseUrl = needsSsl
  ? DATABASE_URL.replace(/sslmode=require/gi, "sslmode=no-verify")
  : DATABASE_URL;

const prismaClientSingleton = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: normalizedDatabaseUrl,
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    }),
    log: [
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ] as const,
  });

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

prisma.$on("warn", (e: Prisma.LogEvent) => logger.warn(e.message));
prisma.$on("error", (e: Prisma.LogEvent) => logger.error(e.message));

if (NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * For transactions that move money or take a lock: several round trips to a
 * remote database can pass Prisma's 5-second default.
 */
export const MONEY_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
/** The same room for any multi-step write (the default 5 s is too tight for the shared database). */
export const WRITE_TX_OPTIONS = MONEY_TX_OPTIONS;

export default prisma;
