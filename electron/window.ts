import path from "node:path";

import {
  BrowserWindow,
  nativeImage,
  screen,
  type BrowserWindowConstructorOptions,
  type BrowserWindow as BrowserWindowType,
} from "electron";

import type { WindowMode, WindowState } from "../shared/ipc";

import type { PersistedWindowState } from "./window-state";

// Each window mode maps to a real OS window size. The OS window is sized to the
// visible glass card so the platform blur material (acrylic / vibrancy) covers
// only the card itself — never a larger transparent stage around it.
export const CARD_SIZES: Record<WindowMode, { width: number; height: number }> = {
  compact: { width: 232, height: 188 },
  notes: { width: 232, height: 188 },
  expanded: { width: 768, height: 568 },
};

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

function resolveRendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, "../dist/index.html")}`;
}

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

// Platform-native translucency: acrylic blur behind the window on Windows 11,
// vibrancy on macOS. Linux has no portable compositor blur, so the renderer
// paints a near-opaque glass fallback (see [data-native-blur="false"] in CSS).
export function glassWindowOptions(): BrowserWindowConstructorOptions {
  if (isWin) {
    // `transparent: true` disables backgroundMaterial on Windows, so the window
    // stays opaque with a fully transparent background colour instead.
    return {
      transparent: false,
      backgroundColor: "#00000000",
      backgroundMaterial: "acrylic",
      roundedCorners: true,
      hasShadow: true,
    };
  }
  if (isMac) {
    return {
      transparent: true,
      vibrancy: "under-window",
      visualEffectState: "active",
      roundedCorners: true,
      hasShadow: true,
    };
  }
  return {
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
  };
}

// True when the OS composites the blur for us; the renderer keeps its glass
// surfaces translucent. On Linux it falls back to near-opaque panels.
export function hasNativeBlur(): boolean {
  return isWin || isMac;
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
  const size = CARD_SIZES.compact;

  const width = Math.min(size.width, workArea.width - 24);
  const height = Math.min(size.height, workArea.height - 24);
  const x = workArea.x + Math.round((workArea.width - width) / 2);
  const y = workArea.y + 16;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    icon: createTrayIcon(),
    show: false,
    ...glassWindowOptions(),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Exclude Almanac itself from screen capture so it never appears in the
  // screenshots it takes — and so capture needs no hide/show flicker.
  // win.setContentProtection(true);

  void win.loadURL(resolveRendererUrl());
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(initialState.alwaysOnTop, "screen-saver");

  win.once("ready-to-show", () => win.show());

  return win;
}

// The OS window is resized to match the active mode's card. The window is
// re-anchored on its own top-centre so the card grows/shrinks in place rather
// than jumping back to the screen centre after the user has moved it.
export function applyWindowMode(win: BrowserWindowType, mode: WindowMode): void {
  if (win.isDestroyed()) return;
  const size = CARD_SIZES[mode];
  const current = win.getBounds();
  if (current.width === size.width && current.height === size.height) return;

  const area = screen.getDisplayMatching(current).workArea;
  let x = Math.round(current.x + current.width / 2 - size.width / 2);
  let y = current.y;
  x = Math.max(area.x, Math.min(x, area.x + area.width - size.width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - size.height));

  win.setBounds({ x, y, width: size.width, height: size.height });
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
