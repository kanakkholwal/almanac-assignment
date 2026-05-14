import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { app } = require("electron/main") as typeof import("electron");
const log = require("electron-log/main.js") as typeof import("electron-log/main.js");

log.initialize();
log.transports.file.level = "info";
log.transports.console.level = "debug";
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "almanac.log");

export const logger = log.scope("almanac");

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}
