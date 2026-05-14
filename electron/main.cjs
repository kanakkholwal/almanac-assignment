const path = require("node:path");

const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");

if (process.platform === "win32") {
  app.disableHardwareAcceleration();
}

const IPC_CHANNELS = {
  windowToggle: "window:toggle",
  windowMode: "window:mode",
  windowAlwaysOnTop: "window:always-on-top",
  windowMinimize: "window:minimize",
  windowMaximizeToggle: "window:maximize-toggle",
  windowClose: "window:close",
  windowGetState: "window:get-state",
  appGetInfo: "app:get-info",
  fetchModels: "assistant:fetch-models",
  startChatCompletion: "assistant:start-chat-completion",
  transcribeAudio: "assistant:transcribe-audio",
  speechSynthesize: "assistant:speech-synthesize",
  mockEvent: "meeting:mock-event",
  assistantStream: "assistant:stream",
  appEvent: "app:event",
  notificationShow: "notification:show",
  notificationStartNotes: "notification:start-notes",
  notificationDismiss: "notification:dismiss",
  notificationData: "notification:data",
};

const NOTIFICATION_SIZE = { width: 540, height: 200 };
let notificationWindow = null;

const DEFAULT_MODE = "compact";
const DEFAULT_MODE_SIZES = {
  compact: { width: 228, height: 152 },
  notes: { width: 96, height: 232 },
  expanded: { width: 760, height: 620 },
};

const VALID_MODES = new Set(["compact", "notes", "expanded"]);

function getInitialPosition(mode, size) {
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

let activeResize = null;

function animateBounds(win, target, duration = 220) {
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
      clearInterval(activeResize);
      activeResize = null;
      return;
    }

    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const next = {
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased),
    };
    win.setBounds(next);

    if (t >= 1) {
      clearInterval(activeResize);
      activeResize = null;
      win.setBounds(target);
    }
  }, frameMs);
}

let mainWindow = null;
let windowMode = DEFAULT_MODE;
let alwaysOnTop = true;

function getRuntimeInfo() {
  return {
    platform: process.platform,
    appVersion: app.getVersion(),
    environment: process.env.NODE_ENV || "development",
    config: {
      baseUrl: process.env.VITE_LITELLM_BASE_URL || "https://litellm.memfold.ai",
      apiKeyPresent: Boolean((process.env.LITELLM_API_KEY || "").trim()),
      defaultChatModel: process.env.VITE_DEFAULT_CHAT_MODEL || "gpt-4o-mini",
      defaultTranscribeModel:
        process.env.VITE_DEFAULT_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      defaultSpeechModel: process.env.VITE_DEFAULT_TTS_MODEL || "gpt-4o-mini-tts",
      environment: process.env.NODE_ENV || "development",
      appVersion: app.getVersion(),
    },
  };
}

function getWindowState() {
  return {
    mode: windowMode,
    alwaysOnTop,
    isMaximized: mainWindow ? mainWindow.isMaximized() : false,
    isVisible: mainWindow ? mainWindow.isVisible() : false,
  };
}

function sendAppEvent(event) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.appEvent, event);
}

function syncWindowState() {
  sendAppEvent({
    type: "window-state",
    state: getWindowState(),
  });
}

function resolveRendererUrl() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }

  return `file://${path.join(__dirname, "..", "dist", "index.html")}`;
}

function createMainWindow() {
  const size = DEFAULT_MODE_SIZES[windowMode];
  const pos = getInitialPosition(windowMode, size);
  const isCompact = windowMode === "compact";

  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: pos.x,
    y: pos.y,
    minWidth: DEFAULT_MODE_SIZES.compact.width,
    minHeight: DEFAULT_MODE_SIZES.compact.height,
    frame: false,
    transparent: true,
    resizable: !isCompact,
    maximizable: !isCompact,
    minimizable: true,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: isCompact,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    ...(isWin ? { backgroundMaterial: "none" } : {}),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  if (isWin && typeof mainWindow.setBackgroundColor === "function") {
    mainWindow.setBackgroundColor("#00000000");
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    syncWindowState();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("maximize", syncWindowState);
  mainWindow.on("unmaximize", syncWindowState);
  mainWindow.on("show", syncWindowState);
  mainWindow.on("hide", syncWindowState);

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    dialog.showErrorBox(
      "Renderer crashed",
      `The UI process exited (${details.reason}). Restart the app to recover.`,
    );
  });

  void mainWindow.loadURL(resolveRendererUrl());
  mainWindow.setAlwaysOnTop(alwaysOnTop, "screen-saver");

  return mainWindow;
}

function resolveNotificationUrl() {
  const base = resolveRendererUrl();
  const separator = base.includes("#") ? "&" : "#";
  return `${base}${separator}notification`;
}

function createNotificationWindow(payload) {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send(IPC_CHANNELS.notificationData, payload);
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
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    ...(isWin ? { backgroundMaterial: "none" } : {}),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ["--almanac-view=notification"],
    },
  });

  if (isWin && typeof notificationWindow.setBackgroundColor === "function") {
    notificationWindow.setBackgroundColor("#00000000");
  }

  notificationWindow.setAlwaysOnTop(true, "screen-saver");
  notificationWindow.loadURL(resolveNotificationUrl());

  notificationWindow.webContents.once("did-finish-load", () => {
    notificationWindow?.webContents.send(IPC_CHANNELS.notificationData, payload);
  });

  notificationWindow.once("ready-to-show", () => {
    notificationWindow?.showInactive();
  });

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

function setWindowMode(mode) {
  windowMode = VALID_MODES.has(mode) ? mode : "expanded";

  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) {
    syncWindowState();
    return;
  }

  const size = DEFAULT_MODE_SIZES[windowMode];
  const isFloating = windowMode === "compact" || windowMode === "notes";
  const target = isFloating
    ? { ...getInitialPosition(windowMode, size), width: size.width, height: size.height }
    : (() => {
        const b = mainWindow.getBounds();
        const workArea = screen.getPrimaryDisplay().workArea;
        const x = Math.min(b.x, workArea.x + workArea.width - size.width - 12);
        const y = Math.min(b.y, workArea.y + workArea.height - size.height - 12);
        return { x: Math.max(workArea.x + 12, x), y: Math.max(workArea.y + 12, y), width: size.width, height: size.height };
      })();

  mainWindow.setResizable(!isFloating);
  mainWindow.setMaximizable(!isFloating);
  mainWindow.setSkipTaskbar(isFloating);
  animateBounds(mainWindow, target);
  syncWindowState();
}

function unsupportedAssistantFeature() {
  throw new Error(
    "Assistant features are disabled in the basic desktop shell. Set up the LiteLLM integration before using chat, transcription, or speech.",
  );
}

function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.windowToggle, async () => {
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
  });

  ipcMain.handle(IPC_CHANNELS.windowMode, async (_event, mode) => {
    setWindowMode(mode);
  });

  ipcMain.handle(IPC_CHANNELS.windowAlwaysOnTop, async (_event, enabled) => {
    alwaysOnTop = Boolean(enabled);
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(alwaysOnTop, "screen-saver");
    }
    syncWindowState();
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

    syncWindowState();
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, async () => {
    mainWindow?.close();
  });

  ipcMain.handle(IPC_CHANNELS.windowGetState, async () => getWindowState());
  ipcMain.handle(IPC_CHANNELS.appGetInfo, async () => getRuntimeInfo());
  ipcMain.handle(IPC_CHANNELS.fetchModels, async () => []);
  ipcMain.handle(IPC_CHANNELS.startChatCompletion, async () => unsupportedAssistantFeature());
  ipcMain.handle(IPC_CHANNELS.transcribeAudio, async () => unsupportedAssistantFeature());
  ipcMain.handle(IPC_CHANNELS.speechSynthesize, async () => unsupportedAssistantFeature());
  ipcMain.handle(IPC_CHANNELS.mockEvent, async (_event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(IPC_CHANNELS.mockEvent, payload);
  });

  ipcMain.handle(IPC_CHANNELS.notificationShow, async (_event, payload) => {
    createNotificationWindow(payload || null);
  });

  ipcMain.handle(IPC_CHANNELS.notificationStartNotes, async () => {
    closeNotificationWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.notificationStartNotes);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle(IPC_CHANNELS.notificationDismiss, async () => {
    closeNotificationWindow();
  });
}

app.whenReady().then(() => {
  registerIpc();
  createMainWindow();

  setTimeout(() => {
    createNotificationWindow({
      title: "Start Alma Notes",
      description: "Take notes & get suggestions in real time",
      actionLabel: "Take Notes",
    });
  }, 1400);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
