import { Redis } from "ioredis";
import { getServiceLogger } from "../../utils/loggerCreator";
import { REDIS_URL } from "../../config/env";

const logger = getServiceLogger("redis");

const parsed = new URL(REDIS_URL);
const useTLS = parsed.protocol === "rediss:";

const redis = new Redis(REDIS_URL, {
  // Don't connect on import — we call redis.connect() explicitly in server.ts
  lazyConnect: true,
  ...(useTLS ? { tls: {} } : {}),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectTimeout: 10_000,
  commandTimeout: 5_000,
  // Exponential back-off capped at 3 s; stop after 10 failed attempts
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 200, 3_000);
  },
  // Auto-reconnect on transient errors
  reconnectOnError: (err) => {
    return ["READONLY", "ETIMEDOUT", "ECONNRESET"].some((e) =>
      err.message.includes(e)
    );
  },
});

redis.on("connect",     () => logger.info("Redis connecting..."));
redis.on("ready",       () => logger.info("Redis ready"));
redis.on("error",       (err) => logger.error("Redis error", { error: err.message }));
redis.on("close",       () => logger.warn("Redis connection closed"));
redis.on("reconnecting",() => logger.warn("Redis reconnecting..."));
redis.on("end",         () => logger.warn("Redis connection ended"));

export default redis;
