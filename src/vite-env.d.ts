/// <reference types="vite/client" />

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
} from "@shared/ipc";

declare global {
  interface Window {
    almanac: {
      toggleWindow: () => Promise<void>;
      setWindowMode: (mode: WindowMode) => Promise<void>;
      setAlwaysOnTop: (enabled: boolean) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      getWindowState: () => Promise<WindowState>;
      getRuntimeInfo: () => Promise<AppRuntimeInfo>;
      fetchModels: () => Promise<ModelOption[]>;
      startChatCompletion: (request: ChatCompletionRequest) => Promise<void>;
      transcribeAudio: (
        audio: ArrayBuffer,
        mimeType: string,
        model: string,
      ) => Promise<string>;
      synthesizeSpeech: (input: string, model: string) => Promise<SpeechPayload>;
      triggerMockEvent: (event: MockMeetingEvent) => Promise<void>;
      onAssistantStream: (listener: (payload: StreamEventPayload) => void) => () => void;
      onAppEvent: (listener: (payload: AppEvent) => void) => () => void;
    };
  }
}

export {};
