import path from "node:path";

import { createRequire } from "node:module";
import type { BrowserWindow as BrowserWindowType } from "electron";
import type { WindowMode, WindowState } from "../shared/ipc.ts";

import type { PersistedWindowState } from "./window-state";

const require = createRequire(import.meta.url);
const { BrowserWindow, nativeImage, screen } = require("electron/main") as typeof import("electron");

const WINDOW_SIZES: Record<WindowMode, { width: number; height: number }> = {
  compact: { width: 220, height: 152 },
  expanded: { width: 760, height: 620 },
};

function resolveRendererUrl() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }

  return `file://${path.join(__dirname, "../dist/index.html")}`;
}

function resolvePreloadPath() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), "dist-electron/preload.js");
  }

  return path.join(__dirname, "preload.js");
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="4" y="4" width="56" height="56" rx="18" fill="#9B3495"/>
      <circle cx="32" cy="32" r="12" fill="#FF8A23"/>
      <circle cx="32" cy="32" r="4" fill="#FFF7FE"/>
    </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
}

export function getAppIcon() {
  return createTrayIcon();
}

export function createMainWindow(initialState: PersistedWindowState) {
  const display = screen.getPrimaryDisplay().workAreaSize;
  const { width, height } = WINDOW_SIZES[initialState.mode];
  const x = initialState.bounds.x || Math.round(display.width - width - 24);
  const y = initialState.bounds.y || 24;

  const win = new BrowserWindow({
    width: initialState.bounds.width || width,
    height: initialState.bounds.height || height,
    minWidth: WINDOW_SIZES.compact.width,
    minHeight: WINDOW_SIZES.compact.height,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: true,
    maximizable: true,
    minimizable: true,
    hasShadow: true,
    skipTaskbar: false,
    backgroundColor: "#160d1d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
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

  void win.loadURL(resolveRendererUrl());
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(initialState.alwaysOnTop, "screen-saver");

  if (initialState.isMaximized) {
    win.maximize();
  } else {
    applyWindowMode(win, initialState.mode);
  }

  win.once("ready-to-show", () => win.show());

  return win;
}

export function applyWindowMode(win: BrowserWindowType, mode: WindowMode) {
  if (win.isMaximized()) {
    return;
  }

  const { width, height } = WINDOW_SIZES[mode];
  const bounds = win.getBounds();

  win.setBounds({
    ...bounds,
    width,
    height,
  });
  win.setMinimumSize(WINDOW_SIZES.compact.width, WINDOW_SIZES.compact.height);
}

export function getWindowState(
  win: BrowserWindowType,
  mode: WindowMode,
  alwaysOnTop: boolean,
): WindowState {
  return {
    mode,
    alwaysOnTop,
    isMaximized: win.isMaximized(),
    isVisible: win.isVisible(),
  };
}
