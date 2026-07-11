import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { logger } from '../config/logger';

/* ============================================================================
 * DISTRIBUTED HTTP RESPONSE CACHE (DEV-025)
 * ----------------------------------------------------------------------------
 * Previously this held a module-level `Map` — per-process, unbounded (an
 * unread key never got evicted, only checked lazily on its next read), and
 * wiped on every restart/deploy. Replaced with Redis so:
 *   - every instance behind the load balancer shares one cache, instead of
 *     each pod serving different stale/fresh data depending on which one
 *     you hit.
 *   - eviction is Redis's own TTL (SET ... EX), not an app-level timestamp
 *     check that only fires if someone happens to re-request the key.
 *   - a Redis outage degrades to "uncached" rather than taking the API down.
 * ==========================================================================*/

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

if (!process.env.REDIS_URL) {
  logger.warn(
    'REDIS_URL is not set — falling back to redis://localhost:6379. ' +
      'Set REDIS_URL in staging/production so the HTTP cache is actually shared across instances.',
    'CacheInterceptor',
  );
}

// Single shared client for the process, same lifetime as the old Map was.
const redisClient = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    // Cap reconnect attempts at 30s apart once we're clearly down — no point
    // hammering every 2s if Redis has been unreachable for a while.
    retryStrategy: (times) => Math.min(times * 1000, 30000),
  },
);

// Log connection state TRANSITIONS only (down -> still down doesn't re-log),
// not every individual retry attempt — otherwise a prolonged Redis outage
// floods the logs with one warning every few seconds, forever.
let redisIsDown = false;

redisClient.on('error', (err) => {
  if (!redisIsDown) {
    redisIsDown = true;
    const detail = err?.message || (err as any)?.code || String(err);
    logger.warn(
      `Redis cache unreachable (${detail}) — serving uncached until it recovers. ` +
        'Further connection errors will be suppressed until reconnected.',
      'CacheInterceptor',
    );
  }
});

redisClient.on('connect', () => {
  if (redisIsDown) {
    redisIsDown = false;
    logger.log('Redis cache connection recovered', 'CacheInterceptor');
  }
});

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const key = this.generateCacheKey(request);

    return from(this.safeGet(key)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          logger.log(`Cache hit for ${key}`, 'CacheInterceptor');
          return of(cached);
        }

        logger.log(`Cache miss for ${key}`, 'CacheInterceptor');
        return next.handle().pipe(
          tap((data) => {
            void this.safeSet(key, data);
          }),
        );
      }),
    );
  }

  private async safeGet(key: string): Promise<any | null> {
    try {
      const raw = await redisClient.get(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (err) {
      logger.warn(
        `Redis GET failed for ${key}, serving uncached: ${(err as Error).message}`,
        'CacheInterceptor',
      );
      return null;
    }
  }

  private async safeSet(key: string, data: any): Promise<void> {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
      logger.log(`Cached response for ${key}`, 'CacheInterceptor');
    } catch (err) {
      logger.warn(
        `Redis SET failed for ${key}, response was not cached: ${(err as Error).message}`,
        'CacheInterceptor',
      );
    }
  }

  private generateCacheKey(request: any): string {
    const { method, originalUrl, query } = request;
    const path = originalUrl.split('?')[0];
    const sortedQuery = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('&');
    const key = `${method}:${originalUrl}?${sortedQuery}`;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    // Keep the plain method+path visible (unhashed) so invalidateCache()
    // can pattern-match and clear every cached query-variant of a given
    // route, without needing to know every exact query string that was cached.
    return `${method}:${path}:${hash}`;
  }
}

/**
 * Deletes every cached entry for a given route path, regardless of which
 * query-string variant was cached. Used to bust stale responses immediately
 * after a mutation that should invalidate them (e.g. an admin marking a
 * business as luxury), rather than waiting out the full CACHE_TTL_SECONDS.
 */
export async function invalidateCache(pathPrefix: string): Promise<void> {
  try {
    const pattern = `*:${pathPrefix}*`;
    const stream = redisClient.scanStream({ match: pattern, count: 100 });
    const keysToDelete: string[] = [];

    for await (const keys of stream) {
      keysToDelete.push(...keys);
    }

    if (keysToDelete.length > 0) {
      await redisClient.unlink(...keysToDelete);
      logger.log(
        `Invalidated ${keysToDelete.length} cache key(s) matching ${pathPrefix}`,
        'CacheInterceptor',
      );
    }
  } catch (err) {
    logger.warn(
      `Cache invalidation failed for ${pathPrefix}: ${(err as Error).message}`,
      'CacheInterceptor',
    );
  }
}
