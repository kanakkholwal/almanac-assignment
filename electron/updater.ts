import { app } from "electron";

import { isAutoUpdateEnabled } from "./config";
import { logger, serializeError } from "./logger";

export type UpdateStatus =
  | "checking"
  | "available"
  | "not-available"
  | "downloaded"
  | "error";

export function setupAutoUpdates(onStatus: (status: UpdateStatus, detail?: string) => void): void {
  if (!isAutoUpdateEnabled()) {
    logger.info("Auto update disabled");
    return;
  }

  if (!app.isPackaged) {
    logger.info("Auto update skipped in development");
    return;
  }

  void (async () => {
    try {
      const { autoUpdater } = await import("electron-updater");

      autoUpdater.autoDownload = false;

      autoUpdater.on("checking-for-update", () => onStatus("checking"));
      autoUpdater.on("update-available", (info) => {
        onStatus("available", info.version);
        void autoUpdater.downloadUpdate();
      });
      autoUpdater.on("update-not-available", () => onStatus("not-available"));
      autoUpdater.on("update-downloaded", (info) => onStatus("downloaded", info.version));
      autoUpdater.on("error", (error) => {
        logger.error("Auto update failed", serializeError(error));
        onStatus("error", error instanceof Error ? error.message : String(error));
      });

      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.error("Failed to check for updates", serializeError(error));
      onStatus("error", error instanceof Error ? error.message : String(error));
    }
  })();
}
