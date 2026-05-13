import { autoUpdater } from "electron-updater";

import { isAutoUpdateEnabled } from "./config";
import { logger, serializeError } from "./logger";

export function setupAutoUpdates(onStatus: (status: string, detail?: string) => void) {
  if (!isAutoUpdateEnabled()) {
    logger.info("Auto update disabled");
    return;
  }

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
    onStatus("error", error == null ? "Unknown updater error" : String(error));
  });

  void autoUpdater.checkForUpdates().catch((error) => {
    logger.error("Failed to check for updates", serializeError(error));
    onStatus("error", error instanceof Error ? error.message : String(error));
  });
}
