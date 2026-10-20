import "dotenv/config";
import cluster from "node:cluster";
import { createServer } from "node:http";
import prisma from "./lib/prisma/prisma";
import redis from "./lib/redis/redis";
import { connectDatabase, startDbWatcher, stopDbWatcher } from "./lib/prisma/dbWatcher";
import { connectRedis } from "./lib/redis/redisWatcher";
import { PORT, NODE_ENV, WEB_CONCURRENCY } from "./config/env";
import { getServiceLogger } from "./utils/loggerCreator";
import { closeCustomerSocket, initCustomerSocket } from "./lib/socket/customerSocket";
import { startJobs, stopJobs } from "./jobs/scheduler";

const logger = getServiceLogger("server");
const IS_PRODUCTION = NODE_ENV === "production";

// ─── Worker: runs the actual HTTP server ─────────────────────────────────────

async function startWorker(): Promise<void> {
  // Establish connections before accepting traffic
  await connectDatabase();
  await connectRedis();

  // Deliberately a dynamic import, not a static one at the top of this file —
  // ./app transitively constructs every route's rate limiter at module-load
  // time, and each one immediately (and asynchronously, un-awaited) issues
  // Redis commands to initialize its RedisStore. A static top-level import
  // would run that whole chain before connectRedis() above even starts,
  // racing a from-scratch connection against those init commands' 5s
  // commandTimeout — harmless (the store retries and self-heals on first
  // real request) but noisy. Importing after Redis is ready removes the race.
  const { default: app } = await import("./app");

  startDbWatcher();

  const httpServer = createServer(app);
  initCustomerSocket(httpServer);

  const server = httpServer.listen(PORT, () => {
    const tag = cluster.isWorker ? ` [worker ${process.pid}]` : "";
    logger.info(`Server on port ${PORT} (${NODE_ENV})${tag}`);
  });

  // Prevent connections from lingering past upstream load-balancer idle timeouts.
  // Both values must exceed nginx / ALB's keepalive timeout (typically 60 s).
  // Scheduled jobs (only when JOBS_ENABLED; each run is claimed once across workers).
  startJobs();

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const gracefulShutdown = (signal: string): void => {
    logger.warn(`${signal} received — graceful shutdown (pid ${process.pid})`);

    stopJobs();

    // Open sockets would keep server.close() waiting; drop them first (clients reconnect).
    closeCustomerSocket().catch((err: Error) => logger.error("Error closing live updates", { error: err.message }));

    // Stop accepting new connections; wait for in-flight requests to finish.
    server.close(async () => {
      try {
        stopDbWatcher();
        await redis.quit();
        await prisma.$disconnect();
        logger.info("Shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error("Error during shutdown", { error: (err as Error).message });
        process.exit(1);
      }
    });

    // Hard-kill if cleanup hangs beyond 10 s.
    setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
}

// ─── Primary: manages the worker pool (production only) ──────────────────────

function startPrimary(): void {
  logger.info(`Primary ${process.pid} — spawning ${WEB_CONCURRENCY} workers`);

  for (let i = 0; i < WEB_CONCURRENCY; i++) cluster.fork();

  // Auto-restart any worker that crashes.
  cluster.on("exit", (worker, code, signal) => {
    logger.warn(
      `Worker ${worker.process.pid} exited (${signal ?? code}) — restarting`
    );
    cluster.fork();
  });

  // Forward signals to workers so each one shuts down cleanly.
  const shutdownAll = (signal: string): void => {
    logger.warn(`Primary ${process.pid} received ${signal} — draining workers`);
    for (const worker of Object.values(cluster.workers ?? {})) {
      worker?.process.kill("SIGTERM");
    }
    // Give workers 12 s, then exit the primary regardless.
    setTimeout(() => process.exit(0), 12_000).unref();
  };

  process.on("SIGTERM", () => shutdownAll("SIGTERM"));
  process.on("SIGINT",  () => shutdownAll("SIGINT"));
}

// ─── Global safety net (primary and every worker) ────────────────────────────

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason });
  process.exit(1);
});

// ─── Entry point ─────────────────────────────────────────────────────────────

if (IS_PRODUCTION && WEB_CONCURRENCY > 1 && cluster.isPrimary) {
  // Production, explicitly multi-worker: primary forks WEB_CONCURRENCY workers.
  startPrimary();
} else {
  // Default: single process — no fork, no primary/worker split. Correct for
  // both local dev and containerized PaaS deployments (Render, etc.), where
  // horizontal scaling happens via replicas, not in-process clustering.
  startWorker().catch((err) => {
    logger.error("Failed to start server", { error: (err as Error).message });
    process.exit(1);
  });
}
