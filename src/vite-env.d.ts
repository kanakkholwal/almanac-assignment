/// <reference types="vite/client" />

import type {
  AppEvent,
  AppRuntimeInfo,
  CaptureResult,
  ChatCompletionRequest,
  MockMeetingEvent,
  ModelOption,
  SpeechPayload,
  StreamEventPayload,
  ThemeInfo,
  ThemeSource,
  WindowMode,
  WindowState,
} from "@shared/ipc";

export interface NotificationPayload {
  title: string;
  description: string;
  actionLabel: string;
}

declare global {
  interface Window {
    almanac: {
      view: "main" | "notification" | "notes";
      toggleWindow: () => Promise<void>;
      setWindowMode: (mode: WindowMode) => Promise<void>;
      setAlwaysOnTop: (enabled: boolean) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      getWindowState: () => Promise<WindowState>;
      getRuntimeInfo: () => Promise<AppRuntimeInfo>;
      fetchModels: (force?: boolean) => Promise<ModelOption[]>;
      startChatCompletion: (request: ChatCompletionRequest) => Promise<void>;
      cancelChatCompletion: (messageId: string) => Promise<boolean>;
      transcribeAudio: (
        audio: ArrayBuffer,
        mimeType: string,
        model: string,
      ) => Promise<string>;
      synthesizeSpeech: (input: string, model: string) => Promise<SpeechPayload>;
      triggerMockEvent: (event: MockMeetingEvent) => Promise<void>;
      showNotification: (payload: NotificationPayload) => Promise<void>;
      notificationStartNotes: () => Promise<void>;
      notificationDismiss: () => Promise<void>;
      notesShow: () => Promise<void>;
      notesStop: () => Promise<void>;
      notesOpenChat: () => Promise<void>;
      captureScreen: () => Promise<CaptureResult>;
      getTheme: () => Promise<ThemeInfo>;
      setTheme: (source: ThemeSource) => Promise<ThemeInfo>;
      onAssistantStream: (listener: (payload: StreamEventPayload) => void) => () => void;
      onAppEvent: (listener: (payload: AppEvent) => void) => () => void;
      onNotificationData: (listener: (payload: NotificationPayload) => void) => () => void;
      onNotificationStartNotes: (listener: () => void) => () => void;
    };
  }
}

export {};
