import path from "node:path";

import { app } from "electron";
import log from "electron-log/main";

log.initialize();
log.transports.file.level = "info";
log.transports.console.level = process.env.NODE_ENV === "production" ? "warn" : "debug";
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "almanac.log");

export const logger = log.scope("almanac");

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause ? { cause: String(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}
