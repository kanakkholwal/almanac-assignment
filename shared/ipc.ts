import { z } from "zod";

export const IPC_CHANNELS = {
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
  cancelChatCompletion: "assistant:cancel-chat-completion",
  transcribeAudio: "assistant:transcribe-audio",
  speechSynthesize: "assistant:speech-synthesize",
  mockEvent: "meeting:mock-event",
  assistantStream: "assistant:stream",
  appEvent: "app:event",
  notificationShow: "notification:show",
  notificationStartNotes: "notification:start-notes",
  notificationDismiss: "notification:dismiss",
  notificationData: "notification:data",
  notesShow: "notes:show",
  notesStop: "notes:stop",
  notesOpenChat: "notes:open-chat",
  captureScreen: "capture:screen",
  themeGet: "theme:get",
  themeSet: "theme:set",
} as const;

export const captureResultSchema = z.object({
  dataUrl: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type CaptureResult = z.infer<typeof captureResultSchema>;

export const windowModeSchema = z.enum(["orb", "compact", "notes", "expanded"]);
export type WindowMode = z.infer<typeof windowModeSchema>;

// Theme follows the OS by default ("system"); the user can pin light or dark
// from the in-app settings menu. `shouldUseDarkColors` is the resolved value.
export const themeSourceSchema = z.enum(["system", "light", "dark"]);
export type ThemeSource = z.infer<typeof themeSourceSchema>;

export const themeInfoSchema = z.object({
  source: themeSourceSchema,
  shouldUseDarkColors: z.boolean(),
});
export type ThemeInfo = z.infer<typeof themeInfoSchema>;

export const modelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  ownedBy: z.string().optional(),
});
export type ModelOption = z.infer<typeof modelOptionSchema>;

export const liteLLMConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKeyPresent: z.boolean(),
  defaultChatModel: z.string().min(1),
  defaultTranscribeModel: z.string().min(1),
  defaultSpeechModel: z.string().min(1),
  environment: z.enum(["development", "production", "test"]),
  appVersion: z.string().min(1),
});
export type LiteLLMConfig = z.infer<typeof liteLLMConfigSchema>;

export const appRuntimeInfoSchema = z.object({
  platform: z.enum(["darwin", "win32", "linux"]),
  appVersion: z.string().min(1),
  environment: z.enum(["development", "production", "test"]),
  config: liteLLMConfigSchema,
});
export type AppRuntimeInfo = z.infer<typeof appRuntimeInfoSchema>;

export const captureStateSchema = z.enum([
  "idle",
  "recording",
  "transcribing",
  "streaming",
  "listening",
]);
export type CaptureState = z.infer<typeof captureStateSchema>;

export const assistantMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(20_000),
  createdAt: z.string().min(1),
  status: z.enum(["sending", "delivered", "read"]).optional(),
  source: z.enum(["litellm", "mock"]).optional(),
  imageUrls: z.array(z.string()).optional(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const replyThreadSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  replies: z.number().int().nonnegative(),
  preview: z.string().min(1),
});
export type ReplyThread = z.infer<typeof replyThreadSchema>;

export const meetingSuggestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  actionLabel: z.string().optional(),
  secondaryLabel: z.string().optional(),
});
export type MeetingSuggestion = z.infer<typeof meetingSuggestionSchema>;

export const timelineItemSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("message"),
    message: assistantMessageSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("thread"),
    thread: replyThreadSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("suggestion"),
    suggestion: meetingSuggestionSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("status"),
    text: z.string().min(1).max(2_000),
    emphasis: z.enum(["default", "accent"]).optional(),
  }),
]);
export type TimelineItem = z.infer<typeof timelineItemSchema>;

export const chatContentPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().max(20_000),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string().min(1),
      detail: z.enum(["auto", "low", "high"]).optional(),
    }),
  }),
]);
export type ChatContentPart = z.infer<typeof chatContentPartSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  // Empty string content is tolerated here; the main process drops empty
  // messages before sending so a stray placeholder never breaks a request.
  content: z.union([
    z.string().max(20_000),
    z.array(chatContentPartSchema).min(1),
  ]),
});

export const chatCompletionRequestSchema = z.object({
  messageId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(16_000).optional(),
});
export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

export const streamEventPayloadSchema = z.object({
  messageId: z.string().min(0),
  delta: z.string().optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});
export type StreamEventPayload = z.infer<typeof streamEventPayloadSchema>;

export const mockMeetingEventSchema = z.object({
  type: z.enum(["meeting-detected", "start-notes", "availability-check"]),
});
export type MockMeetingEvent = z.infer<typeof mockMeetingEventSchema>;

export const speechPayloadSchema = z.object({
  audioUrl: z.string().min(1),
  mimeType: z.string().min(1),
});
export type SpeechPayload = z.infer<typeof speechPayloadSchema>;

export const windowStateSchema = z.object({
  mode: windowModeSchema,
  alwaysOnTop: z.boolean(),
  isMaximized: z.boolean(),
  isVisible: z.boolean(),
});
export type WindowState = z.infer<typeof windowStateSchema>;

export const appEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("window-state"),
    state: windowStateSchema,
  }),
  z.object({
    type: z.literal("runtime-warning"),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal("update-status"),
    status: z.enum(["idle", "checking", "available", "not-available", "downloaded", "error"]),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("theme"),
    theme: themeInfoSchema,
  }),
]);
export type AppEvent = z.infer<typeof appEventSchema>;
