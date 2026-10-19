import prisma from "./prisma";
import { getServiceLogger } from "../../utils/loggerCreator";

const logger = getServiceLogger("db-watcher");

const PING_INTERVAL_MS = 240_000;       // 4 min  — detect issues early
const RECONNECT_INTERVAL_MS = 300_000;  // 5 min  — attempt to heal
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;

let pingInterval: NodeJS.Timeout | null = null;
let reconnectInterval: NodeJS.Timeout | null = null;
let isConnected = false;
let isReconnecting = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkConnection(attempt = 1): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    if (attempt < MAX_RETRIES) {
      logger.warn(
        `DB ping failed (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${RETRY_DELAY_MS}ms`
      );
      await sleep(RETRY_DELAY_MS);
      return checkConnection(attempt + 1);
    }
    return false;
  }
}

async function attemptReconnect(): Promise<void> {
  if (isConnected || isReconnecting) return;

  isReconnecting = true;
  logger.warn("Attempting database reconnection...");

  try {
    await prisma.$disconnect();
    await sleep(1_000);
    await prisma.$connect();

    const healthy = await checkConnection();
    if (!healthy) throw new Error("Reconnect succeeded but ping failed");

    isConnected = true;
    logger.info("Database reconnected successfully");
  } catch (err) {
    logger.error("Database reconnection attempt failed", {
      error: (err as Error).message,
    });
  } finally {
    isReconnecting = false;
  }
}

async function runPingCheck(): Promise<void> {
  const healthy = await checkConnection();

  if (healthy && !isConnected) {
    isConnected = true;
    logger.info("Database connection restored");
  } else if (!healthy && isConnected) {
    isConnected = false;
    logger.error("Database connection lost — reconnector will retry in 5 minutes");
  } else if (!healthy) {
    logger.error("Database still unreachable");
  } else {
    logger.info("Database ping OK");
  }
}

async function runReconnectCheck(): Promise<void> {
  if (isConnected) {
    logger.debug("Reconnect check skipped — DB is healthy");
    return;
  }
  await attemptReconnect();
}

// Wrap async interval callbacks so errors surface as logged warnings,
// not as silent unhandled rejections that crash the process.
function safeInterval(
  fn: () => Promise<void>,
  ms: number
): NodeJS.Timeout {
  return setInterval(() => {
    fn().catch((err: unknown) =>
      logger.error("Interval callback threw unexpectedly", {
        error: (err as Error).message,
      })
    );
  }, ms);
}

export async function connectDatabase(): Promise<void> {
  logger.info("Connecting to database...");
  try {
    await prisma.$connect();
    isConnected = true;
    logger.info("Database connected successfully");
  } catch (err) {
    logger.error("Failed to connect to database", {
      error: (err as Error).message,
    });
    process.exit(1);
  }
}

export function startDbWatcher(): void {
  if (pingInterval || reconnectInterval) return;

  logger.info(`DB ping watcher   — every ${PING_INTERVAL_MS / 1_000}s`);
  logger.info(`DB reconnect watcher — every ${RECONNECT_INTERVAL_MS / 1_000}s`);

  pingInterval = safeInterval(runPingCheck, PING_INTERVAL_MS);
  reconnectInterval = safeInterval(runReconnectCheck, RECONNECT_INTERVAL_MS);

  // Don't block the process from exiting cleanly on SIGTERM.
  pingInterval.unref();
  reconnectInterval.unref();
}

export function stopDbWatcher(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  logger.info("DB watchers stopped");
}

export function isDbConnected(): boolean {
  return isConnected;
}
