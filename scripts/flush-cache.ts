import * as dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Connecting to Redis at ${redisUrl}...`);

const redis = new Redis(redisUrl);

redis
  .flushall()
  .then(() => {
    console.log('Redis cache flushed successfully.');
    return redis.quit();
  })
  .catch((err) => {
    console.error('Failed to flush Redis cache:', err.message);
    process.exit(1);
  });
