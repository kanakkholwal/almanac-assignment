import "dotenv/config";

import { createRequire } from "node:module";
import type { BrowserWindow, Tray as TrayType } from "electron";

import {
  appEventSchema,
  chatCompletionRequestSchema,
  IPC_CHANNELS,
  mockMeetingEventSchema,
  windowModeSchema,
  type AppEvent,
  type MockMeetingEvent,
  type WindowMode,
} from "../shared/ipc.ts";

import { getRuntimeInfo } from "./config";
import { fetchModels, streamChatCompletion, synthesizeSpeech, transcribeAudio } from "./litellm";
import { logger, serializeError } from "./logger";
import { setupAutoUpdates } from "./updater";
import { createMainWindow, getAppIcon, getWindowState, applyWindowMode } from "./window";
import { readWindowState, writeWindowState } from "./window-state";

const require = createRequire(import.meta.url);
const { app, dialog, globalShortcut, ipcMain, Menu, nativeTheme, Tray } =
  require("electron/main") as typeof import("electron");

let mainWindow: BrowserWindow | null = null;
let tray: TrayType | null = null;
let windowMode: WindowMode = "expanded";
let alwaysOnTop = true;
let isQuitting = false;

function sendAppEvent(event: AppEvent) {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.appEvent, appEventSchema.parse(event));
}

function persistWindowState() {
  if (!mainWindow) {
    return;
  }

  writeWindowState({
    bounds: mainWindow.getBounds(),
    isMaximized: mainWindow.isMaximized(),
    mode: windowMode,
    alwaysOnTop,
  });
}

function syncWindowState() {
  if (!mainWindow) {
    return;
  }

  sendAppEvent({
    type: "window-state",
    state: getWindowState(mainWindow, windowMode, alwaysOnTop),
  });
}

function updateTrayMenu() {
  if (!tray || !mainWindow) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
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
  ]);

  tray.setContextMenu(contextMenu);
}

function buildApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
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
          } satisfies Electron.MenuItemConstructorOptions,
        ]
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
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "front" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachWindowLifecycle(win: BrowserWindow) {
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
    if (!win.isDestroyed()) {
      win.reload();
    }
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
  const savedState = readWindowState();
  windowMode = savedState.mode;
  alwaysOnTop = savedState.alwaysOnTop;
  mainWindow = createMainWindow(savedState);
  attachWindowLifecycle(mainWindow);
  syncWindowState();
  return mainWindow;
}

function toggleWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }

  syncWindowState();
}

function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.windowToggle, async () => {
    toggleWindow();
  });

  ipcMain.handle(IPC_CHANNELS.windowMode, async (_event, input: unknown) => {
    const mode = windowModeSchema.parse(input);
    windowMode = mode;
    if (mainWindow) {
      applyWindowMode(mainWindow, mode);
      persistWindowState();
      syncWindowState();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowAlwaysOnTop, async (_event, input: unknown) => {
    alwaysOnTop = Boolean(input);
    mainWindow?.setAlwaysOnTop(alwaysOnTop, "screen-saver");
    persistWindowState();
    syncWindowState();
    updateTrayMenu();
  });

  ipcMain.handle(IPC_CHANNELS.windowMinimize, async () => {
    mainWindow?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.windowMaximizeToggle, async () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }

    persistWindowState();
    syncWindowState();
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, async () => {
    mainWindow?.hide();
    syncWindowState();
  });

  ipcMain.handle(IPC_CHANNELS.windowGetState, async () => {
    if (!mainWindow) {
      throw new Error("Window unavailable");
    }

    return getWindowState(mainWindow, windowMode, alwaysOnTop);
  });

  ipcMain.handle(IPC_CHANNELS.appGetInfo, async () => getRuntimeInfo());
  ipcMain.handle(IPC_CHANNELS.fetchModels, async () => fetchModels());

  ipcMain.handle(IPC_CHANNELS.startChatCompletion, async (_event, input: unknown) => {
    const request = chatCompletionRequestSchema.parse(input);
    if (!mainWindow) {
      return;
    }

    void (async () => {
      try {
        for await (const event of streamChatCompletion(request)) {
          mainWindow?.webContents.send(IPC_CHANNELS.assistantStream, event);
        }
      } catch (error) {
        logger.error("Chat completion failed", serializeError(error));
        mainWindow?.webContents.send(IPC_CHANNELS.assistantStream, {
          messageId: request.messageId,
          error: error instanceof Error ? error.message : "Chat request failed",
        });
      }
    })();
  });

  ipcMain.handle(IPC_CHANNELS.transcribeAudio, async (_event, audio: ArrayBuffer, mimeType: string, model: string) =>
    transcribeAudio(new Uint8Array(audio), mimeType, model),
  );

  ipcMain.handle(IPC_CHANNELS.speechSynthesize, async (_event, input: string, model: string) =>
    synthesizeSpeech(input, model),
  );

  ipcMain.handle(IPC_CHANNELS.mockEvent, async (_event, input: unknown) => {
    const mockEvent: MockMeetingEvent = mockMeetingEventSchema.parse(input);
    mainWindow?.webContents.send(IPC_CHANNELS.mockEvent, mockEvent);
  });
}

async function bootstrap() {
  await app.whenReady();

  nativeTheme.themeSource = "dark";
  buildApplicationMenu();
  createWindow();

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
    if (!mainWindow) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", serializeError(error));
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", serializeError(error));
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
  persistWindowState();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
