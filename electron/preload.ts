import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type {
  AppEvent,
  AppRuntimeInfo,
  CaptureResult,
  ChatCompletionRequest,
  MockMeetingEvent,
  ModelOption,
  SpeechPayload,
  StreamEventPayload,
  WindowMode,
  WindowState,
} from "../shared/ipc";
import {
  appEventSchema,
  appRuntimeInfoSchema,
  captureResultSchema,
  chatCompletionRequestSchema,
  IPC_CHANNELS,
  mockMeetingEventSchema,
  modelOptionSchema,
  speechPayloadSchema,
  streamEventPayloadSchema,
  windowModeSchema,
  windowStateSchema,
} from "../shared/ipc";

interface NotificationPayload {
  title: string;
  description: string;
  actionLabel: string;
}

const view = (
  process.argv.find((arg) => arg.startsWith("--almanac-view="))?.split("=")[1] ?? "main"
) as "main" | "notification" | "notes";

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api = {
  view,

  toggleWindow: () => invoke<void>(IPC_CHANNELS.windowToggle),
  setWindowMode: (mode: WindowMode) =>
    invoke<void>(IPC_CHANNELS.windowMode, windowModeSchema.parse(mode)),
  setAlwaysOnTop: (enabled: boolean) =>
    invoke<void>(IPC_CHANNELS.windowAlwaysOnTop, Boolean(enabled)),
  minimizeWindow: () => invoke<void>(IPC_CHANNELS.windowMinimize),
  toggleMaximizeWindow: () => invoke<void>(IPC_CHANNELS.windowMaximizeToggle),
  closeWindow: () => invoke<void>(IPC_CHANNELS.windowClose),
  getWindowState: async () =>
    windowStateSchema.parse(await invoke<WindowState>(IPC_CHANNELS.windowGetState)),

  getRuntimeInfo: async () =>
    appRuntimeInfoSchema.parse(await invoke<AppRuntimeInfo>(IPC_CHANNELS.appGetInfo)),

  fetchModels: async (force = false): Promise<ModelOption[]> =>
    (await invoke<ModelOption[]>(IPC_CHANNELS.fetchModels, force)).flatMap((item) => {
      const result = modelOptionSchema.safeParse(item);
      return result.success ? [result.data] : [];
    }),

  startChatCompletion: (request: ChatCompletionRequest) =>
    invoke<void>(IPC_CHANNELS.startChatCompletion, chatCompletionRequestSchema.parse(request)),
  cancelChatCompletion: (messageId: string) =>
    invoke<boolean>(IPC_CHANNELS.cancelChatCompletion, messageId),

  transcribeAudio: (audio: ArrayBuffer, mimeType: string, model: string) =>
    invoke<string>(IPC_CHANNELS.transcribeAudio, audio, mimeType, model),

  synthesizeSpeech: async (input: string, model: string) =>
    speechPayloadSchema.parse(
      await invoke<SpeechPayload>(IPC_CHANNELS.speechSynthesize, input, model),
    ),

  triggerMockEvent: (event: MockMeetingEvent) =>
    invoke<void>(IPC_CHANNELS.mockEvent, mockMeetingEventSchema.parse(event)),

  showNotification: (payload: NotificationPayload) =>
    invoke<void>(IPC_CHANNELS.notificationShow, payload),
  notificationStartNotes: () => invoke<void>(IPC_CHANNELS.notificationStartNotes),
  notificationDismiss: () => invoke<void>(IPC_CHANNELS.notificationDismiss),
  notesShow: () => invoke<void>(IPC_CHANNELS.notesShow),
  notesStop: () => invoke<void>(IPC_CHANNELS.notesStop),
  notesOpenChat: () => invoke<void>(IPC_CHANNELS.notesOpenChat),

  captureScreen: async () =>
    captureResultSchema.parse(await invoke<CaptureResult>(IPC_CHANNELS.captureScreen)),

  onAssistantStream: (listener: (payload: StreamEventPayload) => void) => {
    const handler = (_event: IpcRendererEvent, payload: StreamEventPayload) => {
      const parsed = streamEventPayloadSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(IPC_CHANNELS.assistantStream, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.assistantStream, handler);
  },

  onAppEvent: (listener: (payload: AppEvent) => void) => {
    const handler = (_event: IpcRendererEvent, payload: AppEvent) => {
      const parsed = appEventSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(IPC_CHANNELS.appEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appEvent, handler);
  },

  onNotificationData: (listener: (payload: NotificationPayload) => void) => {
    const handler = (_event: IpcRendererEvent, payload: NotificationPayload) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.notificationData, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.notificationData, handler);
  },

  onNotificationStartNotes: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on(IPC_CHANNELS.notificationStartNotes, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.notificationStartNotes, handler);
  },
};

contextBridge.exposeInMainWorld("almanac", Object.freeze(api));
