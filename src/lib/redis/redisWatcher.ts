import redis from "./redis";
import { getServiceLogger } from "../../utils/loggerCreator";

const logger = getServiceLogger("redis");

let isConnected = false;

// Track connection state from ioredis events.
// Logging for these transitions is already handled in redis.ts.
redis.on("ready", () => { isConnected = true; });
redis.on("close", () => { isConnected = false; });

// ioredis fires "end" when retryStrategy returns null (all retries exhausted).
// At that point we schedule a single manual reconnect attempt; if that also
// exhausts retries, "end" fires again and we repeat.
redis.on("end", () => {
  isConnected = false;
  logger.warn("Redis retries exhausted — scheduling manual reconnect in 5s");
  setTimeout(() => {
    redis.connect().catch((err: Error) => {
      logger.error("Manual Redis reconnect failed", { error: err.message });
    });
  }, 5_000);
});

// ─── Public API ───────────────────────────────────────────────────────────────

export async function connectRedis(): Promise<void> {
  if (redis.status === "ready") {
    isConnected = true;
    return;
  }

  // ioredis is mid-connection — wait for it to settle instead of calling connect()
  // again (which throws "already connecting/connected")
  if (redis.status === "connecting" || redis.status === "reconnecting") {
    await new Promise<void>((resolve, reject) => {
      redis.once("ready", resolve);
      redis.once("error", reject);
    });
    isConnected = true;
    return;
  }

  // status === "wait" (fresh) or "end" (gave up) — safe to call connect()
  logger.info("Connecting to Redis...");
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error(`Unexpected PING response: ${pong}`);
    isConnected = true;
    logger.info("Redis connected successfully");
  } catch (err) {
    // A failure here (e.g. a command timeout during the initial handshake) has
    // usually already put ioredis into its own "reconnecting" state via the
    // retryStrategy configured in redis.ts — killing the process immediately
    // would throw away that in-flight retry over what may be a transient blip.
    // Give it a chance to recover before giving up for good.
    logger.warn("Initial Redis connection attempt failed — waiting for automatic retry", {
      error: (err as Error).message,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        redis.once("ready", resolve);
        redis.once("end", () => reject(new Error("Redis retries exhausted")));
      });
      isConnected = true;
      logger.info("Redis connected successfully (after retry)");
    } catch (retryErr) {
      logger.error("Failed to connect to Redis", {
        error: (retryErr as Error).message,
      });
      process.exit(1);
    }
  }
}

export function isRedisConnected(): boolean {
  return isConnected;
}
