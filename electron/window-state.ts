import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

import type { Rectangle } from "electron";

import type { WindowMode } from "../shared/ipc";

export interface PersistedWindowState {
  bounds: Rectangle;
  isMaximized: boolean;
  mode: WindowMode;
  alwaysOnTop: boolean;
}

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  bounds: {
    x: 0,
    y: 0,
    width: 712,
    height: 528,
  },
  isMaximized: false,
  mode: "expanded",
  alwaysOnTop: true,
};

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

export function readWindowState(): PersistedWindowState {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf8");
    const parsed = JSON.parse(raw) as PersistedWindowState;
    return {
      ...DEFAULT_WINDOW_STATE,
      ...parsed,
      bounds: {
        ...DEFAULT_WINDOW_STATE.bounds,
        ...parsed.bounds,
      },
    };
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

export function writeWindowState(state: PersistedWindowState) {
  fs.mkdirSync(path.dirname(getWindowStatePath()), { recursive: true });
  fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), "utf8");
}
