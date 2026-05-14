import path from "node:path";

import {
  BrowserWindow,
  nativeImage,
  screen,
  type BrowserWindow as BrowserWindowType,
} from "electron";

import type { WindowMode, WindowState } from "../shared/ipc";

import type { PersistedWindowState } from "./window-state";

export const WINDOW_SIZES: Record<WindowMode, { width: number; height: number }> = {
  compact: { width: 220, height: 176 },
  notes: { width: 96, height: 232 },
  expanded: { width: 760, height: 620 },
};

export function getInitialPosition(
  mode: WindowMode,
  size: { width: number; height: number },
): { x: number; y: number } {
  const workArea = screen.getPrimaryDisplay().workArea;
  if (mode === "compact" || mode === "notes") {
    return {
      x: workArea.x + Math.round((workArea.width - size.width) / 2),
      y: workArea.y + 16,
    };
  }
  return {
    x: workArea.x + Math.round(workArea.width - size.width - 24),
    y: workArea.y + 24,
  };
}

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
  const size = WINDOW_SIZES[initialState.mode];
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const isFloating = initialState.mode === "compact" || initialState.mode === "notes";

  const fallbackPos = getInitialPosition(initialState.mode, size);
  const x = isFloating ? fallbackPos.x : initialState.bounds.x || fallbackPos.x;
  const y = isFloating ? fallbackPos.y : initialState.bounds.y || fallbackPos.y;

  const width = isFloating ? size.width : initialState.bounds.width || size.width;
  const height = isFloating ? size.height : initialState.bounds.height || size.height;

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 80,
    minHeight: 80,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: !isFloating,
    minimizable: true,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: isFloating,
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

  if (initialState.isMaximized) {
    win.maximize();
  }

  win.once("ready-to-show", () => win.show());

  return win;
}

let activeResize: NodeJS.Timeout | null = null;

export function animateBounds(
  win: BrowserWindowType,
  target: { x: number; y: number; width: number; height: number },
  durationMs = 220,
): void {
  if (!win || win.isDestroyed()) return;
  if (activeResize) {
    clearInterval(activeResize);
    activeResize = null;
  }

  const start = win.getBounds();
  const startTime = Date.now();
  const frameMs = 1000 / 60;

  activeResize = setInterval(() => {
    if (!win || win.isDestroyed()) {
      if (activeResize) clearInterval(activeResize);
      activeResize = null;
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    win.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased),
    });

    if (t >= 1) {
      if (activeResize) clearInterval(activeResize);
      activeResize = null;
      win.setBounds(target);
    }
  }, frameMs);
}

export function applyWindowMode(win: BrowserWindowType, mode: WindowMode): void {
  if (win.isMaximized()) return;

  const size = WINDOW_SIZES[mode];
  const isFloating = mode === "compact" || mode === "notes";

  let target: { x: number; y: number; width: number; height: number };
  if (isFloating) {
    target = { ...getInitialPosition(mode, size), width: size.width, height: size.height };
  } else {
    const bounds = win.getBounds();
    const workArea = screen.getPrimaryDisplay().workArea;
    const x = Math.min(bounds.x, workArea.x + workArea.width - size.width - 12);
    const y = Math.min(bounds.y, workArea.y + workArea.height - size.height - 12);
    target = {
      x: Math.max(workArea.x + 12, x),
      y: Math.max(workArea.y + 12, y),
      width: size.width,
      height: size.height,
    };
  }

  win.setMaximizable(!isFloating);
  win.setSkipTaskbar(isFloating);
  animateBounds(win, target);
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
