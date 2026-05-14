import { createRequire } from "node:module";

import type {
  AppEvent,
  AppRuntimeInfo,
  ChatCompletionRequest,
  MockMeetingEvent,
  ModelOption,
  SpeechPayload,
  StreamEventPayload,
  WindowMode,
  WindowState,
} from "../shared/ipc.ts";
import {
  appEventSchema,
  appRuntimeInfoSchema,
  chatCompletionRequestSchema,
  IPC_CHANNELS,
  mockMeetingEventSchema,
  modelOptionSchema,
  speechPayloadSchema,
  streamEventPayloadSchema,
  windowModeSchema,
  windowStateSchema,
} from "../shared/ipc.ts";

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require("electron/renderer") as typeof import("electron");

function invoke<T>(channel: string, ...args: unknown[]) {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api = {
  toggleWindow: () => invoke<void>(IPC_CHANNELS.windowToggle),
  setWindowMode: (mode: WindowMode) =>
    invoke<void>(IPC_CHANNELS.windowMode, windowModeSchema.parse(mode)),
  setAlwaysOnTop: (enabled: boolean) =>
    invoke<void>(IPC_CHANNELS.windowAlwaysOnTop, Boolean(enabled)),
  minimizeWindow: () => invoke<void>(IPC_CHANNELS.windowMinimize),
  toggleMaximizeWindow: () => invoke<void>(IPC_CHANNELS.windowMaximizeToggle),
  closeWindow: () => invoke<void>(IPC_CHANNELS.windowClose),
  getWindowState: async () => windowStateSchema.parse(await invoke<WindowState>(IPC_CHANNELS.windowGetState)),
  getRuntimeInfo: async () =>
    appRuntimeInfoSchema.parse(await invoke<AppRuntimeInfo>(IPC_CHANNELS.appGetInfo)),
  fetchModels: async () =>
    (await invoke<ModelOption[]>(IPC_CHANNELS.fetchModels)).map((item) =>
      modelOptionSchema.parse(item),
    ),
  startChatCompletion: (request: ChatCompletionRequest) =>
    invoke<void>(IPC_CHANNELS.startChatCompletion, chatCompletionRequestSchema.parse(request)),
  transcribeAudio: (audio: ArrayBuffer, mimeType: string, model: string) =>
    invoke<string>(IPC_CHANNELS.transcribeAudio, audio, mimeType, model),
  synthesizeSpeech: async (input: string, model: string) =>
    speechPayloadSchema.parse(
      await invoke<SpeechPayload>(IPC_CHANNELS.speechSynthesize, input, model),
    ),
  triggerMockEvent: (event: MockMeetingEvent) =>
    invoke<void>(IPC_CHANNELS.mockEvent, mockMeetingEventSchema.parse(event)),
  onAssistantStream: (listener: (payload: StreamEventPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: StreamEventPayload) =>
      listener(streamEventPayloadSchema.parse(payload));
    ipcRenderer.on(IPC_CHANNELS.assistantStream, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.assistantStream, handler);
  },
  onAppEvent: (listener: (payload: AppEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AppEvent) =>
      listener(appEventSchema.parse(payload));
    ipcRenderer.on(IPC_CHANNELS.appEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appEvent, handler);
  },
};

contextBridge.exposeInMainWorld("almanac", Object.freeze(api));
