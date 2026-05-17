import fs from "node:fs";
import path from "node:path";

import { app, type Rectangle } from "electron";

import type { ThemeSource, WindowMode } from "../shared/ipc";

import { logger, serializeError } from "./logger";

export interface PersistedWindowState {
  bounds: Rectangle;
  isMaximized: boolean;
  mode: WindowMode;
  alwaysOnTop: boolean;
  themeSource: ThemeSource;
}

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  bounds: { x: 0, y: 0, width: 760, height: 620 },
  isMaximized: false,
  mode: "compact",
  alwaysOnTop: true,
  themeSource: "system",
};

function getWindowStatePath(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

export function readWindowState(): PersistedWindowState {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedWindowState>;
    return {
      ...DEFAULT_WINDOW_STATE,
      ...parsed,
      bounds: { ...DEFAULT_WINDOW_STATE.bounds, ...(parsed.bounds ?? {}) },
    };
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

export function writeWindowState(state: PersistedWindowState): void {
  try {
    fs.mkdirSync(path.dirname(getWindowStatePath()), { recursive: true });
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    logger.warn("Failed to persist window state", serializeError(error));
  }
}
