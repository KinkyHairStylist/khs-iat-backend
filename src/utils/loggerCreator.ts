import { createLogger, format, transports, Logger } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";
import { NODE_ENV, LOG_LEVEL } from "../config/env";

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/**
 * Strips ASCII control characters to prevent log injection.
 * Safe for user-supplied strings: req.url, req.method, headers, etc.
 */
export function sanitizeLogValue(value: unknown, maxLen = 512): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(CONTROL_CHARS, "?").slice(0, maxLen);
}

const LOG_DIR = path.join(process.cwd(), "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const loggerCache = new Map<string, Logger>();

const baseFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  format.splat()
);

const jsonFormat = format.combine(baseFormat, format.json());

const consoleFormat = (serviceName: string) =>
  format.combine(
    baseFormat,
    format.colorize({ all: true }),
    format.printf(({ level, message, timestamp, stack, service: _svc, ...meta }) => {
      // Strip the service key — it's already shown in the prefix
      const metaStr = Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : "";
      const stackStr = stack ? `\n${stack}` : "";
      return `[${timestamp}] [${serviceName.toUpperCase()}] ${level}: ${message}${metaStr}${stackStr}`;
    })
  );

// Single root logger that owns the global process exception/rejection listeners.
// Per-service loggers must NOT add their own — that's what causes the MaxListeners warning.
createLogger({
  format: jsonFormat,
  transports: [],
  exceptionHandlers: [
    new transports.File({ filename: path.join(LOG_DIR, "exceptions.log"), format: jsonFormat }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(LOG_DIR, "rejections.log"), format: jsonFormat }),
  ],
});

export function getServiceLogger(serviceName: string): Logger {
  if (loggerCache.has(serviceName)) {
    return loggerCache.get(serviceName)!;
  }

  // Development: always debug so every log line is visible in the terminal.
  // Production: respect LOG_LEVEL from env.
  const level = NODE_ENV === "production" ? LOG_LEVEL : "debug";

  const logger = createLogger({
    level,
    defaultMeta: { service: serviceName },
    format: baseFormat,
    transports: [
      // Never silent — console output must always be visible during dev and prod
      new transports.Console({
        format: consoleFormat(serviceName),
      }),

      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: `${serviceName}.%DATE%.log`,
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "10m",
        maxFiles: "14d",
        format: jsonFormat,
      }),

      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: `${serviceName}.error.%DATE%.log`,
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "10m",
        maxFiles: "30d",
        level: "error",
        format: jsonFormat,
      }),
    ],
  });

  loggerCache.set(serviceName, logger);
  return logger;
}
