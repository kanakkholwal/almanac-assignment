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

// The main window is a single fixed-size, transparent stage — it is never
// resized. The renderer morphs one surface (orb ↔ compact ↔ chat) inside it and
// forwards the mouse through the transparent regions, so switching modes never
// triggers an OS-level window resize and therefore never flickers.
const STAGE = { width: 768, height: 568 } as const;
export const CARD_SIZES: Record<WindowMode, { width: number; height: number }> = {
  orb: STAGE,
  compact: STAGE,
  notes: STAGE,
  expanded: STAGE,
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
      transparent: true,
      roundedCorners: true,
      hasShadow: false,
    };
  }
  if (isMac) {
    return {
      transparent: true,
      vibrancy: "under-window",
      visualEffectState: "active",
      roundedCorners: true,
      hasShadow: false,
    };
  }
  return {
    transparent: true,
    roundedCorners: true,
    hasShadow: false,
  };
}

// The Almanac brand mark (orange disc + two eyes) as a 64×64 PNG. `nativeImage`
// cannot rasterise SVG — an SVG data URL silently yields an empty image — so
// the logo is pre-rendered to PNG and inlined here. Mirrors src/components/Logo.
const TRAY_ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC2ElEQVR42u1bO46cQBDtI/QROAJH4AaeG7hTMuTYAYljp86QYwedOCe05ATHTuYCljrbtKw3CwghGPpXu3y6pNJqZ9CbV4/u6qLoFiIZv1EpciqFolLUVApNpWhXXPfX4Nr8yAHLPggEZKgU5OmmxwCWPELgBZWiCQh4y4Fd7DXwljHwube7EIJKkfVDlN7J8dvZewVfBc7vWA4O1VsnOL2DwJdGg3yL5azbYfCDd2zLZx+82XHw0ymRXzX4+CIcMPh4IvQJrztg8NOcIEME0AcOflwdQtZ5OolXPhWeOZEAxqliPMnQ95sK/YMNndQLGwHaEwvQXvnub48C5mbGXrx5VvTQRVwuCaAuJIC6ytJnvySerPDZLIyWnvjoYp7Hmf+fJNGPiuiPJvrbEv1qiL6r189jEOXDV1MBai+QnzXRi6FFw+cgGkKSF78OS4C4ExMzxpDWmuq6fvy93++vX/iS5MafJkLn8hc/OjGQAszclVIP4vS1oF3hz8tiZwH+3UdyILFEbvA8z8n81rQr/CABvuQjuaZpnpIbvKoq+6TFjR8sADJyb1mWWRGUUtoPU278YAGQmfukZENu8PbDTvBjCdB1HasAbPgrAmhXAWAuBLuPch/4K8tg7SPA7XazIoe5bD1HufFXCiHlIwCGKRLQFkEULj4CsOCvlMK5jwDDUvWMJL5/mIcALPhLD0NOj8MzgjCUpShYhmULhPE/7uBongJEx196HHZKhAsErSxAgKj4Txoi6kICKP+m6DkEkP5t8eML0IS9GPl24yXIjb/1emyzLP6cuZND98Z2ePLit3FejqI352IY1i5rNB9+Eef1OO7SWq9ubmhuuD6r8+DruBsk0LjYIglyuM6nZxcX3zhvqbXaIoM7NWtejnMSwzK0dR0Pv+LfJIUsPDjHiwx/fJ22yaWNkmmrbNosnbbLpwMT6chMOjSVjs2lg5Pp6Gw6PJ1sZv8BSefJkDhQa9AAAAAASUVORK5CYII=";

function createTrayIcon() {
  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG}`);
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
