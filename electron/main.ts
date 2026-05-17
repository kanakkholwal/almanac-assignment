import path from "node:path";

import type { BrowserWindow as BrowserWindowType } from "electron";
import {
  app,
  BrowserWindow,
  crashReporter,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  Tray,
} from "electron";

import {
  appEventSchema,
  chatCompletionRequestSchema,
  IPC_CHANNELS,
  mockMeetingEventSchema,
  themeSourceSchema,
  windowModeSchema,
  type AppEvent,
  type MockMeetingEvent,
  type ThemeInfo,
  type ThemeSource,
  type WindowMode,
} from "../shared/ipc";

import { getRuntimeInfo, hasApiKey } from "./config";
import {
  cancelAllStreams,
  cancelStream,
  fetchModels,
  streamChatCompletion,
  synthesizeSpeech,
  transcribeAudio,
} from "./litellm";
import { logger, serializeError } from "./logger";
import { setupAutoUpdates } from "./updater";
import {
  applyWindowMode,
  createMainWindow,
  getAppIcon,
  getWindowState,
  glassWindowOptions,
} from "./window";
import { readWindowState, writeWindowState } from "./window-state";

if (process.platform === "win32") {
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindowType | null = null;
let notificationWindow: BrowserWindowType | null = null;
let notesWindow: BrowserWindowType | null = null;
let tray: Tray | null = null;
let windowMode: WindowMode = "orb";
let alwaysOnTop = true;
let themeSource: ThemeSource = "system";
let isQuitting = false;

const NOTIFICATION_SIZE = { width: 540, height: 200 } as const;
const NOTES_SIZE = { width: 60, height: 200 } as const;

interface NotificationPayload {
  title: string;
  description: string;
  actionLabel: string;
}

function sendAppEvent(event: AppEvent) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const parsed = appEventSchema.safeParse(event);
  if (!parsed.success) {
    logger.warn("Dropped invalid app event", parsed.error.flatten());
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.appEvent, parsed.data);
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  writeWindowState({
    bounds: mainWindow.getBounds(),
    isMaximized: mainWindow.isMaximized(),
    mode: windowMode,
    alwaysOnTop,
    themeSource,
  });
}

function currentThemeInfo(): ThemeInfo {
  return { source: themeSource, shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
}

function syncWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendAppEvent({
    type: "window-state",
    state: getWindowState(mainWindow, windowMode, alwaysOnTop),
  });
}

function updateTrayMenu() {
  if (!tray || !mainWindow) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Almanac",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: alwaysOnTop ? "Disable Always On Top" : "Enable Always On Top",
        click: () => {
          alwaysOnTop = !alwaysOnTop;
          mainWindow?.setAlwaysOnTop(alwaysOnTop, "screen-saver");
          persistWindowState();
          syncWindowState();
          updateTrayMenu();
        },
      },
      { type: "separator" },
      {
        label: "Open Meeting Notes",
        click: () => createNotesWindow(),
      },
      {
        label: "Show Meeting Prompt",
        click: () =>
          createNotificationWindow({
            title: "Start Alma Notes",
            description: "Take notes & get suggestions in real time",
            actionLabel: "Take Notes",
          }),
      },
      { type: "separator" },
      { role: "reload", label: "Reload" },
      { role: "forceReload", label: "Force Reload" },
      { type: "separator" },
      {
        label: "Quit",
        accelerator: "CmdOrCtrl+Q",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit", accelerator: "Cmd+Q" },
            ],
          },
        ] satisfies Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        { label: "Close Window", accelerator: "CmdOrCtrl+W", click: () => mainWindow?.hide() },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachWindowLifecycle(win: BrowserWindowType) {
  const save = () => {
    persistWindowState();
    syncWindowState();
  };
  win.on("move", save);
  win.on("resize", save);
  win.on("maximize", save);
  win.on("unmaximize", save);
  win.on("show", save);
  win.on("hide", save);
  win.on("closed", () => {
    mainWindow = null;
  });
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      syncWindowState();
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    logger.error("Renderer process crashed", details);
    dialog.showErrorBox(
      "Almanac renderer crashed",
      `The UI process exited (${details.reason}). Almanac will reload the window.`,
    );
    if (!win.isDestroyed()) win.reload();
  });
  win.webContents.on("unresponsive", () => {
    logger.warn("Window became unresponsive");
    sendAppEvent({
      type: "runtime-warning",
      message: "The Almanac window became unresponsive. Try reloading the app.",
    });
  });
}

function createWindow() {
  const saved = readWindowState();
  // The idle orb is always the home surface; it morphs into the compact
  // launcher on hover. Boot into orb regardless of last-saved mode.
  saved.mode = "orb";
  saved.isMaximized = false;
  windowMode = saved.mode;
  alwaysOnTop = saved.alwaysOnTop;
  themeSource = saved.themeSource ?? "system";
  nativeTheme.themeSource = themeSource;
  mainWindow = createMainWindow(saved);
  attachWindowLifecycle(mainWindow);
  syncWindowState();
  return mainWindow;
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
  syncWindowState();
}

function resolveNotificationUrl(): string {
  const base = process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : `file://${path.join(__dirname, "../dist/index.html")}`;
  const separator = base.includes("#") ? "&" : "#";
  return `${base}${separator}notification`;
}

function createNotificationWindow(payload: NotificationPayload | null) {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    if (payload) {
      notificationWindow.webContents.send(IPC_CHANNELS.notificationData, payload);
    }
    notificationWindow.showInactive();
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const x = workArea.x + Math.round((workArea.width - NOTIFICATION_SIZE.width) / 2);
  const y = workArea.y + 16;
  const isWin = process.platform === "win32";

  notificationWindow = new BrowserWindow({
    width: NOTIFICATION_SIZE.width,
    height: NOTIFICATION_SIZE.height,
    x,
    y,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    ...glassWindowOptions(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ["--almanac-view=notification"],
    },
  });

  if (isWin && typeof notificationWindow.setBackgroundColor === "function") {
    notificationWindow.setBackgroundColor("#00000000");
  }

  notificationWindow.setContentProtection(true);
  notificationWindow.setAlwaysOnTop(true, "screen-saver");
  void notificationWindow.loadURL(resolveNotificationUrl());

  notificationWindow.webContents.once("did-finish-load", () => {
    if (payload) {
      notificationWindow?.webContents.send(IPC_CHANNELS.notificationData, payload);
    }
  });
  notificationWindow.once("ready-to-show", () => notificationWindow?.showInactive());
  notificationWindow.on("closed", () => {
    notificationWindow = null;
  });
}

function closeNotificationWindow() {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.close();
  }
  notificationWindow = null;
}

function resolveNotesUrl(): string {
  const base = process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : `file://${path.join(__dirname, "../dist/index.html")}`;
  const separator = base.includes("#") ? "&" : "#";
  return `${base}${separator}notes`;
}

function createNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.show();
    notesWindow.focus();
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const x = workArea.x + Math.round((workArea.width - NOTES_SIZE.width) / 2);
  const y = workArea.y + 16;
  const isWin = process.platform === "win32";

  notesWindow = new BrowserWindow({
    width: NOTES_SIZE.width,
    height: NOTES_SIZE.height,
    x,
    y,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    ...glassWindowOptions(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ["--almanac-view=notes"],
    },
  });

  if (isWin && typeof notesWindow.setBackgroundColor === "function") {
    notesWindow.setBackgroundColor("#00000000");
  }

  notesWindow.setContentProtection(true);
  notesWindow.setAlwaysOnTop(true, "screen-saver");
  void notesWindow.loadURL(resolveNotesUrl());

  notesWindow.once("ready-to-show", () => notesWindow?.show());
  notesWindow.on("closed", () => {
    notesWindow = null;
  });
}

function closeNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.close();
  }
  notesWindow = null;
}

const CAPTURE_MAX_EDGE = 1920;

async function captureScreen(): Promise<{ dataUrl: string; width: number; height: number }> {
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const pxW = Math.round(display.size.width * scale);
  const pxH = Math.round(display.size.height * scale);
  const longest = Math.max(pxW, pxH);
  const factor = longest > CAPTURE_MAX_EDGE ? CAPTURE_MAX_EDGE / longest : 1;
  const thumbnailSize = {
    width: Math.max(1, Math.round(pxW * factor)),
    height: Math.max(1, Math.round(pxH * factor)),
  };

  // Almanac's windows use setContentProtection(true), so they are already
  // excluded from the capture — no need to hide/show them.
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
  });
  const primary =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!primary || primary.thumbnail.isEmpty()) {
    throw new Error("Screen capture returned no image");
  }
  const size = primary.thumbnail.getSize();
  const jpeg = primary.thumbnail.toJPEG(80);
  return {
    dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    width: size.width,
    height: size.height,
  };
}

function setMode(mode: WindowMode) {
  windowMode = mode;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  applyWindowMode(mainWindow, mode);
  persistWindowState();
  syncWindowState();
}

function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.windowToggle, async () => toggleWindow());

  ipcMain.handle(IPC_CHANNELS.windowMode, async (_event, input: unknown) => {
    const mode = windowModeSchema.parse(input);
    setMode(mode);
  });

  ipcMain.handle(IPC_CHANNELS.windowAlwaysOnTop, async (_event, input: unknown) => {
    alwaysOnTop = Boolean(input);
    mainWindow?.setAlwaysOnTop(alwaysOnTop, "screen-saver");
    persistWindowState();
    syncWindowState();
    updateTrayMenu();
  });

  ipcMain.handle(IPC_CHANNELS.windowMinimize, async () => mainWindow?.minimize());

  ipcMain.handle(IPC_CHANNELS.windowMaximizeToggle, async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    persistWindowState();
    syncWindowState();
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, async () => {
    mainWindow?.hide();
    syncWindowState();
  });

  ipcMain.handle(IPC_CHANNELS.windowGetState, async () => {
    if (!mainWindow) throw new Error("Window unavailable");
    return getWindowState(mainWindow, windowMode, alwaysOnTop);
  });

  ipcMain.handle(IPC_CHANNELS.appGetInfo, async () => getRuntimeInfo());

  ipcMain.handle(IPC_CHANNELS.fetchModels, async (_event, force?: unknown) =>
    fetchModels(Boolean(force)),
  );

  ipcMain.handle(IPC_CHANNELS.startChatCompletion, async (_event, input: unknown) => {
    if (!hasApiKey()) {
      throw new Error("LITELLM_API_KEY is not configured.");
    }
    const request = chatCompletionRequestSchema.parse(input);
    if (!mainWindow || mainWindow.isDestroyed()) return;

    void streamChatCompletion(request, {
      onEvent: (event) => {
        mainWindow?.webContents.send(IPC_CHANNELS.assistantStream, event);
      },
    }).catch((error) => {
      logger.error("Chat completion failed", serializeError(error));
      mainWindow?.webContents.send(IPC_CHANNELS.assistantStream, {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : "Chat request failed",
      });
    });
  });

  ipcMain.handle(IPC_CHANNELS.cancelChatCompletion, async (_event, messageId: unknown) => {
    if (typeof messageId !== "string") return false;
    return cancelStream(messageId);
  });

  ipcMain.handle(
    IPC_CHANNELS.transcribeAudio,
    async (_event, audio: ArrayBuffer, mimeType: string, model: string) =>
      transcribeAudio(new Uint8Array(audio), mimeType, model),
  );

  ipcMain.handle(IPC_CHANNELS.speechSynthesize, async (_event, input: string, model: string) =>
    synthesizeSpeech(input, model),
  );

  ipcMain.handle(IPC_CHANNELS.mockEvent, async (_event, input: unknown) => {
    const mockEvent: MockMeetingEvent = mockMeetingEventSchema.parse(input);
    mainWindow?.webContents.send(IPC_CHANNELS.mockEvent, mockEvent);
  });

  ipcMain.handle(IPC_CHANNELS.notificationShow, async (_event, payload: unknown) => {
    const valid =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).title === "string" &&
      typeof (payload as Record<string, unknown>).description === "string" &&
      typeof (payload as Record<string, unknown>).actionLabel === "string";
    createNotificationWindow(valid ? (payload as NotificationPayload) : null);
  });

  ipcMain.handle(IPC_CHANNELS.notificationStartNotes, async () => {
    closeNotificationWindow();
    createNotesWindow();
  });

  ipcMain.handle(IPC_CHANNELS.notificationDismiss, async () => {
    closeNotificationWindow();
  });

  ipcMain.handle(IPC_CHANNELS.notesShow, async () => {
    createNotesWindow();
  });

  ipcMain.handle(IPC_CHANNELS.captureScreen, async () => captureScreen());

  ipcMain.handle(IPC_CHANNELS.notesStop, async () => {
    closeNotesWindow();
  });

  ipcMain.handle(IPC_CHANNELS.notesOpenChat, async () => {
    closeNotesWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle(IPC_CHANNELS.themeGet, async () => currentThemeInfo());

  ipcMain.handle(IPC_CHANNELS.themeSet, async (_event, input: unknown) => {
    themeSource = themeSourceSchema.parse(input);
    nativeTheme.themeSource = themeSource;
    persistWindowState();
    return currentThemeInfo();
  });
}

async function bootstrap() {
  crashReporter.start({
    productName: "Almanac",
    companyName: "Memfold",
    uploadToServer: false,
    compress: true,
  });

  await app.whenReady();

  buildApplicationMenu();
  createWindow();

  // Broadcast OS-level light/dark changes so the renderer can re-theme live
  // while the user keeps the "system" preference.
  nativeTheme.on("updated", () => {
    sendAppEvent({ type: "theme", theme: currentThemeInfo() });
  });

  tray = new Tray(getAppIcon());
  tray.setToolTip("Almanac");
  tray.on("click", () => toggleWindow());
  updateTrayMenu();

  globalShortcut.register("CommandOrControl+Shift+Space", () => toggleWindow());
  globalShortcut.register("CommandOrControl+Shift+A", () => toggleWindow());

  registerIpc();  

  setupAutoUpdates((status, detail) => {
    sendAppEvent({
      type: "update-status",
      status: status as Extract<AppEvent, { type: "update-status" }>["status"],
      detail,
    });
  });

  app.on("activate", () => {
    if (!mainWindow) createWindow();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", serializeError(error));
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", serializeError(reason));
});

void bootstrap().catch((error) => {
  logger.error("Bootstrap failed", serializeError(error));
  dialog.showErrorBox(
    "Almanac failed to start",
    error instanceof Error ? error.message : "Unknown startup failure",
  );
  app.exit(1);
});

app.on("before-quit", () => {
  isQuitting = true;
  cancelAllStreams();
  persistWindowState();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) app.quit();
});

app.on("will-quit", () => {
  cancelAllStreams();
  globalShortcut.unregisterAll();
});
