import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';

interface CacheEntry {
  data: any;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache: Map<string, CacheEntry> = new Map();

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const key = this.generateCacheKey(request);

    if (cache.has(key)) {
      const entry = cache.get(key)!;
      if (Date.now() - entry.timestamp < CACHE_TTL) {
                return new Observable((observer) => {
          observer.next(entry.data);
          observer.complete();
        });
      }
      cache.delete(key);
    }

    
    return next.handle().pipe(
      tap((data) => {
        cache.set(key, {
          data,
          timestamp: Date.now(),
        });
              }),
    );
  }

  private generateCacheKey(request: any): string {
    const { method, originalUrl, query } = request;
    const sortedQuery = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('&');
    const key = `${method}:${originalUrl}?${sortedQuery}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }
}