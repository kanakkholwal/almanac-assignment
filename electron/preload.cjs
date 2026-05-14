const { contextBridge, ipcRenderer } = require("electron");

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

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

const view = process.argv.find((arg) => arg.startsWith("--almanac-view="))?.split("=")[1] ?? "main";

contextBridge.exposeInMainWorld(
  "almanac",
  Object.freeze({
    view,
    toggleWindow: () => invoke(IPC_CHANNELS.windowToggle),
    setWindowMode: (mode) => invoke(IPC_CHANNELS.windowMode, mode),
    setAlwaysOnTop: (enabled) => invoke(IPC_CHANNELS.windowAlwaysOnTop, Boolean(enabled)),
    minimizeWindow: () => invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximizeWindow: () => invoke(IPC_CHANNELS.windowMaximizeToggle),
    closeWindow: () => invoke(IPC_CHANNELS.windowClose),
    getWindowState: () => invoke(IPC_CHANNELS.windowGetState),
    getRuntimeInfo: () => invoke(IPC_CHANNELS.appGetInfo),
    fetchModels: () => invoke(IPC_CHANNELS.fetchModels),
    startChatCompletion: (request) => invoke(IPC_CHANNELS.startChatCompletion, request),
    transcribeAudio: (audio, mimeType, model) =>
      invoke(IPC_CHANNELS.transcribeAudio, audio, mimeType, model),
    synthesizeSpeech: (input, model) => invoke(IPC_CHANNELS.speechSynthesize, input, model),
    triggerMockEvent: (event) => invoke(IPC_CHANNELS.mockEvent, event),
    showNotification: (payload) => invoke(IPC_CHANNELS.notificationShow, payload),
    notificationStartNotes: () => invoke(IPC_CHANNELS.notificationStartNotes),
    notificationDismiss: () => invoke(IPC_CHANNELS.notificationDismiss),
    onAssistantStream: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.assistantStream, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.assistantStream, handler);
    },
    onAppEvent: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.appEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.appEvent, handler);
    },
    onNotificationData: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.notificationData, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.notificationData, handler);
    },
    onNotificationStartNotes: (listener) => {
      const handler = () => listener();
      ipcRenderer.on(IPC_CHANNELS.notificationStartNotes, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.notificationStartNotes, handler);
    },
  }),
);
