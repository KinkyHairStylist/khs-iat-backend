import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";
import { NODE_ENV } from "../config/env.validation";

const logDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const isProduction = NODE_ENV === "production";

export function getServiceLogger(serviceName: string) {
  return createLogger({
    level: isProduction ? "info" : "debug",
    format: format.combine(format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" })),
    transports: [
      // Console with color formatting
      new transports.Console({
        level: isProduction ? "info" : "debug",
        format: format.combine(
          format.colorize({ all: true }),
          format.printf(
            ({ level, message, timestamp }) =>
              `[${timestamp}] ${serviceName.toUpperCase()} ${level}: ${message}`
          )
        ),
      }),

      // Daily rotating file logs
      new DailyRotateFile({
        dirname: logDir,
        filename: `${serviceName}.%DATE%.log`,
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "10m",
        maxFiles: "1d",
        level: isProduction ? "warn" : "debug",
        format: format.printf(
          ({ level, message, timestamp }) =>
            `[${timestamp}] ${serviceName.toUpperCase()} ${level}: ${message}`
        ),
      }),
    ],
  });
}
