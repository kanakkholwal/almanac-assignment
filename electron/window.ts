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
  // The orb is the idle launcher: a small circular widget. The window is square
  // and a touch larger than the orb itself so its drop shadow has room to fall.
  orb: { width: 128, height: 128 },
  compact: { width: 232, height: 188 },
  notes: { width: 232, height: 188 },
  expanded: { width: 768, height: 568 },
};

function resolveRendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, "../dist/index.html")}`;
}

function resolvePreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

// Real glass needs an OS blur material: a transparent window plus CSS
// `backdrop-filter` only blurs content *inside* the page — it cannot reach the
// desktop composited behind a transparent window, so the card ends up a flat
// translucent tint. Acrylic (Windows 11) and vibrancy (macOS) blur the desktop
// for us. Linux has no portable compositor blur, so it falls back to a
// near-opaque CSS panel.
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

function createTrayIcon() {
  const svg = `
   <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="54" height="54" rx="27" fill="#ff6900"/>
    <rect x="1" y="1" width="54" height="54" rx="27" stroke="#ff6900" stroke-width="2"/>
    <rect x="11" y="23" width="12" height="21" rx="6" fill="white"/>
    <rect x="13" y="25" width="10" height="10" rx="5" fill="black"/>
    <rect x="32" y="23" width="12" height="21" rx="6" fill="white"/>
    <rect x="34" y="25" width="10" height="10" rx="5" fill="black"/>
</svg>
`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
}

export function getAppIcon() {
  return createTrayIcon();
}

export function createMainWindow(initialState: PersistedWindowState): BrowserWindowType {
  const workArea = screen.getPrimaryDisplay().workArea;
  const size = CARD_SIZES[initialState.mode] ?? CARD_SIZES.compact;

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
