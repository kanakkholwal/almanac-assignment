import path from "node:path";

import {
  BrowserWindow,
  nativeImage,
  screen,
  type BrowserWindow as BrowserWindowType,
} from "electron";

import type { WindowMode, WindowState } from "../shared/ipc";

import type { PersistedWindowState } from "./window-state";

// The window is a transparent fixed-size stage sized to fit the largest mode's
// card with a small margin. The visible card morphs inside via framer-motion;
// the OS window never resizes on mode change.

const STAGE = { width: 1200, height: 640 } as const;

function resolveRendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, "../dist/index.html")}`;
}

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="4" y="4" width="56" height="56" rx="18" fill="#0a0a0a" stroke="#212327" stroke-width="1"/>
      <circle cx="24" cy="32" r="5" fill="#ff7a17"/>
      <circle cx="40" cy="32" r="5" fill="#ff7a17"/>
    </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
}

export function getAppIcon() {
  return createTrayIcon();
}

export function createMainWindow(initialState: PersistedWindowState): BrowserWindowType {
  const workArea = screen.getPrimaryDisplay().workArea;
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  const width = Math.min(STAGE.width, workArea.width - 24);
  const height = Math.min(STAGE.height, workArea.height - 24);
  const x = workArea.x + Math.round((workArea.width - width) / 2);
  const y = workArea.y + 16;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    ...(isWin ? { backgroundMaterial: "none" as const } : {}),
    icon: createTrayIcon(),
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  if (isWin && typeof win.setBackgroundColor === "function") {
    win.setBackgroundColor("#00000000");
  }

  void win.loadURL(resolveRendererUrl());
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(initialState.alwaysOnTop, "screen-saver");

  win.once("ready-to-show", () => win.show());

  return win;
}

// Mode no longer drives OS-level resize — framer-motion morphs the inner card.
// Retained for IPC compatibility; the renderer just owns the active mode.
export function applyWindowMode(_win: BrowserWindowType, _mode: WindowMode): void {
  // intentional no-op: rendering is handled in the renderer
}

export function getWindowState(
  win: BrowserWindowType,
  mode: WindowMode,
  alwaysOnTop: boolean,
): WindowState {
  return {
    mode,
    alwaysOnTop,
    isMaximized: false,
    isVisible: win.isVisible(),
  };
}
