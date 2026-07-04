import { ConsoleLogger, LogLevel, Injectable, Scope } from '@nestjs/common';

/* ============================================================================
 * 🪵 CENTRAL APPLICATION LOGGER
 * ----------------------------------------------------------------------------
 * A single, production-ready logger built on top of NestJS's ConsoleLogger so
 * it works in BOTH worlds with zero extra dependencies:
 *
 *   • Inside NestJS (DI)      -> app.useLogger(logger) in main.ts, or inject
 *                                `new Logger(MyService.name)` as usual.
 *   • Outside NestJS (plain)  -> import { logger } and call logger.error(...)
 *                                from scripts, database.ts, bootstrap, etc.
 *
 * BEHAVIOUR
 *   • production (NODE_ENV !== 'development')
 *       -> emits ONE structured JSON line per log, ideal for CloudWatch /
 *          Datadog / Loki / any log aggregator that parses JSON.
 *   • development
 *       -> pretty, colorized, human-readable output (Nest's default style).
 *
 * WHY JSON IN PROD?  Aggregators can index fields (level, context, traceId,
 * stack) so you can filter/alert on them instead of grepping raw text.
 *
 * ── USAGE EXAMPLES ──────────────────────────────────────────────────────────
 *   import { logger } from './config/logger';
 *
 *   logger.log('Server started on port 3000', 'Bootstrap');
 *   logger.warn('Payment retry', 'PaymentService', { orderId, attempt: 2 });
 *
 *   // Log an error with full stack + structured context:
 *   try { ... } catch (err) {
 *     logger.logError(err, 'PaymentService', { orderId, userId });
 *   }
 * ==========================================================================*/

const isProduction = process.env.NODE_ENV !== 'development';

// Which levels to emit. Override with LOG_LEVEL=debug (comma-separated also ok:
// LOG_LEVEL=error,warn,log). Defaults: quieter in prod, verbose in dev.
const resolveLevels = (): LogLevel[] => {
  const raw = (process.env.LOG_LEVEL ?? '').trim().toLowerCase();

  if (raw) {
    const order: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
    // If a single level is given, treat it as a threshold (that level + above).
    if (order.includes(raw as LogLevel)) {
      return order.slice(order.indexOf(raw as LogLevel));
    }
    // Otherwise treat as an explicit comma-separated allow-list.
    const explicit = raw
      .split(',')
      .map((l) => l.trim())
      .filter((l): l is LogLevel => order.includes(l as LogLevel));
    if (explicit.length) return explicit;
  }

  return isProduction
    ? ['log', 'warn', 'error', 'fatal']
    : ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
};

// Keys whose values must never hit the logs (case-insensitive, substring match).
const SENSITIVE_KEYS = [
  'password',
  'pass',
  'token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'accesstoken',
  'refreshtoken',
  'card',
  'cvv',
  'pin',
  'otp',
];

const REDACTED = '[REDACTED]';

/**
 * Recursively strips sensitive values from metadata before it is logged.
 * Guards against circular refs so a bad payload can never crash the logger.
 */
const redact = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    out[key] = SENSITIVE_KEYS.some((s) => lower.includes(s))
      ? REDACTED
      : redact(val, seen);
  }
  return out;
};

/** Normalizes anything thrown (Error, string, object) into message + stack. */
const describeError = (
  err: unknown,
): { message: string; stack?: string; name?: string; code?: unknown } => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: (err as any).code,
    };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
};

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  constructor(context?: string) {
    super(context ?? 'App', { logLevels: resolveLevels() });
  }

  /**
   * In production we replace Nest's pretty printer with a single JSON line.
   * In development we fall back to ConsoleLogger's colorized formatting.
   */
  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    if (!isProduction) {
      // Dev: keep the nice colored Nest output.
      return super.printMessages(messages, context, logLevel, writeStreamType);
    }

    const stream = writeStreamType === 'stderr' ? process.stderr : process.stdout;

    for (const message of messages) {
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level: logLevel,
        context: context || this.context || undefined,
        pid: process.pid,
      };

      if (typeof message === 'object' && message !== null) {
        Object.assign(entry, redact(message));
      } else {
        entry.message = message;
      }

      stream.write(`${JSON.stringify(entry)}\n`);
    }
  }

  /**
   * 🔴 Preferred way to log an error. Accepts the raw thrown value, an optional
   * context (usually the class/module name), and optional structured metadata.
   * Guarantees the stack trace and any error `code` are captured.
   */
  logError(err: unknown, context?: string, meta?: Record<string, unknown>): void {
    const { message, stack, name, code } = describeError(err);

    if (isProduction) {
      // Structured single-line JSON — goes through printMessages above.
      this.error(
        {
          message,
          errorName: name,
          code,
          stack,
          ...(meta ? { meta: redact(meta) } : {}),
        } as any,
        undefined,
        context ?? this.context,
      );
    } else {
      // Dev: readable message + stack, with meta appended if present.
      const suffix = meta ? ` ${JSON.stringify(redact(meta))}` : '';
      this.error(`${message}${suffix}`, stack, context ?? this.context);
    }
  }
}

/**
 * 🌍 Shared singleton for non-DI contexts (scripts, database.ts, bootstrap
 * before the Nest app exists). Inside Nest providers you can either inject
 * AppLogger or keep using `new Logger(MyClass.name)` — both route through here.
 */
export const logger = new AppLogger('App');
