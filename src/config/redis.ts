import Redis from "ioredis";
// import dotenv from "dotenv";
import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT, USE_REDIS } from "./env.validation";
import { getServiceLogger } from "../utils/createLogger";

// dotenv.config();

const useRedis = USE_REDIS === "true";
const logger = getServiceLogger("redis");

let redis: Redis | null = null;
let isRedisConnected = false;

// Local Redis setup (default to localhost)
const redisOptions = {
  port: REDIS_PORT,
  host: REDIS_HOST,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
};

// connect redis
export const connectRedis = async (): Promise<Redis | null> => {
  if (!useRedis) {
    logger.warn("⚠️ Redis has been disabled. Failed to start connection");
    return null;
  }

  if (redis && isRedisConnected) return redis;

  const instance = new Redis(redisOptions);

  instance.on("ready", () => {
    logger.info("✅ Redis is READY for connection");
    isRedisConnected = true;
    redis = instance;
  });

  instance.on("close", () => {
    logger.warn("⚠️ Redis connection closed");
    isRedisConnected = false;
    redis = null;
  });

  instance.on("error", (err) => {
    logger.warn("⚠️ Redis error: " + err.message);
    // no disconnect() here → prevents “connection closed” spam
  });

  try {
    await instance.connect();
    if (instance.status === "ready") {
      isRedisConnected = true;
      redis = instance;
      logger.info("✅ Redis connected successfully");
      return instance;
    }
  } catch (err: any) {
    logger.warn(
      "⚠️ Redis unavailable, continuing without cache: " + err.message,
    );
    instance.disconnect();
  }

  return null;
};

export const getConnectedRedis = async (): Promise<Redis | null> => {
  if (!useRedis) {
    logger.warn("⚠️ Redis has been disabled. Skip connection");
    return null;
  }

  if (!redis || !isRedisConnected) {
    return await connectRedis();
  }
  return redis;
};

export default redis;

let redisReconnectInterval: NodeJS.Timeout | null = null;

export const startRedisReconnectInterval = () => {
  if (!useRedis) {
    logger.warn("⚠️ Redis has been disabled. No reconnection needed");
    return null;
  }

  redisReconnectInterval = setInterval(async () => {
    if (!isRedisConnected) {
      logger.warn("🔁 Trying to reconnect to Redis...");
      try {
        await connectRedis();

        // If Redis reconnects, reinitialize the queue
        if (isRedisConnected) {
          logger.info("✅ Redis reconnected, reinitializing queue...");
          // await initializeQueue();
        }
      } catch (err) {
        logger.error("Redis reconnection failed: " + (err as Error).message);
        // Do not rethrow — we want the app to keep running
      }
    }
  }, 10_000);
};

// disconnect redis
export const disconnectRedis = async () => {
  if (!useRedis) {
    logger.warn("⚠️ Redis has been disabled. No disconnection needed");
    return null;
  }

  if (!redis) return;

  try {
    await redis.quit(); // graceful shutdown
    logger.warn("Redis DISCONNECTED");
  } catch (error) {
    redis.disconnect();
  } finally {
    redis = null;
    isRedisConnected = false;
  }
};

export function getUserRedisDbReady() {
  return isRedisConnected;
}
