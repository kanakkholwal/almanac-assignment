import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  HeadphoneOff,
  Headphones,
  LoaderCircle,
  Mic,
  MicOff,
  Minimize2,
  MonitorPlay,
  Pin,
  SendHorizonal,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AppRuntimeInfo,
  AssistantMessage,
  CaptureState,
  ChatContentPart,
  ModelOption,
  TimelineItem,
  WindowMode,
} from "@shared/ipc";
import { timelineItemSchema } from "@shared/ipc";
import { sanitizeMultilineText } from "@shared/sanitize";

import { AlmaAvatar } from "@/components/AlmaAvatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import {
  matchMeetingWorkflow,
  startNotesTimeline,
} from "@/lib/mockMeetingAdapter";
import { cn, createId, formatClock, normalizePrompt } from "@/lib/utils";

const CompactLauncher = lazy(async () =>
  import("@/features/assistant/CompactLauncher").then((m) => ({
    default: m.CompactLauncher,
  })),
);
const Transcript = lazy(async () =>
  import("@/features/assistant/Transcript").then((m) => ({ default: m.Transcript })),
);

const STORAGE_KEY = "almanac.timeline.v2";

const defaultModels = {
  chat: import.meta.env.VITE_DEFAULT_CHAT_MODEL || "claude-sonnet-4-6",
  transcribe: import.meta.env.VITE_DEFAULT_TRANSCRIBE_MODEL || "whisper-1",
  speech: import.meta.env.VITE_DEFAULT_TTS_MODEL || "tts-1",
};

const DEMO_MODE = import.meta.env.VITE_ENABLE_DEMO === "true";

// The LiteLLM backend exposes no speech-to-text or text-to-speech models, so
// voice input/output is disabled. Flip to true once audio models are available.
const VOICE_ENABLED = false;

// A "screen session" captures a short bounded burst of frames the user can then
// ask about — controlled and cheap, vs. an open-ended polling loop.
const SESSION_FRAME_COUNT = 5;
const SESSION_FRAME_INTERVAL_MS = 2000;

// Models that cannot serve /v1/chat/completions — image generation, embeddings,
// realtime audio, speech. Excluded from the chat picker and fallback selection.
const NON_CHAT_MODEL = /imagen|image-preview|image-generate|embedding|realtime|tts|whisper/i;

function chatModels(available: ModelOption[]): ModelOption[] {
  return available.filter((m) => !NON_CHAT_MODEL.test(m.id));
}

function pickChatModel(
  available: ModelOption[],
  configuredDefault: string | undefined,
): string {
  const preferred = configuredDefault ?? defaultModels.chat;
  if (available.some((m) => m.id === preferred)) return preferred;
  const usable = chatModels(available);
  const fallback = usable.find((m) =>
    /claude-sonnet|claude-opus|gpt-5\.|gemini-3/i.test(m.id),
  );
  return fallback?.id ?? usable[0]?.id ?? available[0]?.id ?? preferred;
}

function buildTimelineMessage(
  role: AssistantMessage["role"],
  content: string,
  options?: Partial<Omit<AssistantMessage, "id" | "role" | "content" | "createdAt">> & {
    id?: string;
  },
): TimelineItem {
  const id = options?.id ?? createId(role);
  const { id: _ignored, ...rest } = options ?? {};
  return {
    id,
    kind: "message",
    message: {
      id,
      role,
      content: sanitizeMultilineText(content),
      createdAt: new Date().toISOString(),
      ...rest,
    },
  };
}

function loadPersistedTimeline(): TimelineItem[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown[];
    return parsed
      .map((item) => timelineItemSchema.safeParse(item))
      .filter((item) => item.success)
      .map((item) => item.data);
  } catch {
    return [];
  }
}

const LazyFallback = memo(function LazyFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" />
      Loading…
    </div>
  );
});

type BannerTone = "warning" | "info" | "error";

const BANNER_TOKENS: Record<
  BannerTone,
  { icon: typeof AlertCircle; iconClass: string }
> = {
  warning: { icon: TriangleAlert, iconClass: "text-foreground/80" },
  info: { icon: CheckCircle2, iconClass: "text-foreground/80" },
  error: { icon: AlertCircle, iconClass: "text-destructive" },
};

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: BannerTone;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const tokens = BANNER_TOKENS[tone];
  const Icon = tokens.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-2 flex items-center gap-2.5 rounded-sm border border-hairline bg-canvas-soft px-3 py-2 text-xs text-foreground/85",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", tokens.iconClass)} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {onDismiss ? (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mr-1 flex size-5 items-center justify-center rounded-pill text-foreground/60 transition hover:bg-white/6 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </motion.div>
  );
}

export default function App() {
  const [windowMode, setWindowMode] = useState<WindowMode>("compact");
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>(() => loadPersistedTimeline());
  const [input, setInput] = useState("");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runtimeWarning, setRuntimeWarning] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => formatClock());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<TimelineItem[]>(timeline);
  const speechEnabledRef = useRef(false);
  const hasBootstrappedRef = useRef(false);
  const streamingMessageIdRef = useRef<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [captureCount, setCaptureCount] = useState<number | null>(null);
  const captureSessionRef = useRef(false);
  const deferredTimeline = useDeferredValue(timeline);

  useEffect(() => {
    speechEnabledRef.current = speechEnabled;
  }, [speechEnabled]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatClock()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    timelineRef.current = timeline;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timeline));
    } catch {
      // storage full or unavailable — non-fatal
    }
    const node = viewportRef.current;
    if (node) {
      requestAnimationFrame(() => {
        node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      });
    }
  }, [timeline]);

  useEffect(() => {
    let active = true;
    const almanac = window.almanac;
    if (!almanac) {
      setError("Desktop bridge unavailable — open via the Almanac desktop app.");
      return;
    }

    void Promise.all([
      almanac.getRuntimeInfo(),
      almanac.getWindowState(),
      almanac.fetchModels().catch(() => [] as ModelOption[]),
    ])
      .then(([runtime, state, available]) => {
        if (!active) return;
        setRuntimeInfo(runtime);
        setWindowMode(state.mode);
        setAlwaysOnTop(state.alwaysOnTop);
        setModels(available);
        setSelectedModel(pickChatModel(available, runtime.config.defaultChatModel));
        hasBootstrappedRef.current = true;
      })
      .catch((fetchError) => {
        if (active) {
          setError(
            fetchError instanceof Error ? fetchError.message : "Startup initialization failed",
          );
        }
      });

    const unsubscribeStream = almanac.onAssistantStream(async (payload) => {
      if (payload.error) {
        setCaptureState("idle");
        streamingMessageIdRef.current = null;
        setTimeline((current) =>
          current.filter(
            (item) =>
              !(
                item.kind === "message" &&
                item.message.id === payload.messageId &&
                item.message.content.trim().length === 0
              ),
          ),
        );
        setError(payload.error);
        return;
      }

      if (payload.delta) {
        setTimeline((current) =>
          current.map((item) =>
            item.kind === "message" && item.message.id === payload.messageId
              ? {
                  ...item,
                  message: {
                    ...item.message,
                    content: sanitizeMultilineText(item.message.content + payload.delta),
                  },
                }
              : item,
          ),
        );
      }

      if (payload.done) {
        setCaptureState("idle");
        streamingMessageIdRef.current = null;
        if (speechEnabledRef.current) {
          const finished = timelineRef.current.find(
            (item) => item.kind === "message" && item.message.id === payload.messageId,
          );
          if (finished?.kind === "message" && finished.message.content) {
            try {
              const speech = await almanac.synthesizeSpeech(
                finished.message.content,
                defaultModels.speech,
              );
              const audio = new Audio(speech.audioUrl);
              await audio.play();
            } catch (speechError) {
              setError(
                speechError instanceof Error ? speechError.message : "Speech synthesis failed",
              );
            }
          }
        }
      }
    });

    const unsubscribeApp = almanac.onAppEvent((event) => {
      if (event.type === "window-state") {
        setWindowMode(event.state.mode);
        setAlwaysOnTop(event.state.alwaysOnTop);
      }
      if (event.type === "runtime-warning") setRuntimeWarning(event.message);
      if (event.type === "update-status") {
        setUpdateStatus(
          event.detail ? `Updater: ${event.status} (${event.detail})` : `Updater: ${event.status}`,
        );
      }
    });

    return () => {
      active = false;
      unsubscribeStream();
      unsubscribeApp();
    };
  }, []);

  useEffect(() => {
    if (!hasBootstrappedRef.current) return;
    void window.almanac?.setWindowMode(windowMode);
  }, [windowMode]);

  const messageHistory = useMemo(
    () =>
      timeline
        .filter((item): item is Extract<TimelineItem, { kind: "message" }> => item.kind === "message")
        .map((item) => ({ role: item.message.role, content: item.message.content }))
        .filter((message) => message.content.trim().length > 0),
    [timeline],
  );

  const appendTimeline = useCallback((items: TimelineItem[]) => {
    setTimeline((current) => [...current, ...items]);
  }, []);

  const startNotes = useCallback(() => {
    setCaptureState("listening");
    appendTimeline(startNotesTimeline());
  }, [appendTimeline]);

  useEffect(() => {
    const off = window.almanac?.onNotificationStartNotes?.(() => startNotes());
    return () => off?.();
  }, [startNotes]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const trimmed = normalizePrompt(raw);
      const images = attachedImages;
      if (!trimmed && images.length === 0) return;

      setError(null);
      const promptText =
        trimmed ||
        (images.length > 1
          ? "These frames were captured from my screen over a few seconds. Describe what's happening and anything noteworthy."
          : "What's on my screen? Briefly describe what you see.");

      const userItem = buildTimelineMessage("user", trimmed, {
        status: "read",
        source: "mock",
        imageUrls: images.length > 0 ? images : undefined,
      });

      appendTimeline([userItem]);
      setInput("");
      setAttachedImages([]);

      if (DEMO_MODE && images.length === 0) {
        const mocked = matchMeetingWorkflow(trimmed);
        if (mocked) {
          window.setTimeout(() => appendTimeline(mocked), 280);
          return;
        }
      }

      const assistantId = createId("assistant");
      const placeholder = buildTimelineMessage("assistant", "", {
        id: assistantId,
        source: "litellm",
      });

      appendTimeline([placeholder]);
      setCaptureState("streaming");
      streamingMessageIdRef.current = assistantId;

      const userContent: string | ChatContentPart[] =
        images.length > 0
          ? [
              { type: "text", text: promptText },
              ...images.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ]
          : promptText;

      try {
        await window.almanac.startChatCompletion({
          messageId: assistantId,
          model: selectedModel || pickChatModel(models, runtimeInfo?.config.defaultChatModel),
          messages: [
            {
              role: "system",
              content:
                "You are Alma, a concise, proactive desktop assistant for meetings, notes, and scheduling. Be terse, warm, and lowercase.",
            },
            ...messageHistory,
            { role: "user", content: userContent },
          ],
        });
      } catch (streamError) {
        setCaptureState("idle");
        streamingMessageIdRef.current = null;
        setError(streamError instanceof Error ? streamError.message : "Unable to start chat");
      }
    },
    [appendTimeline, attachedImages, messageHistory, models, runtimeInfo, selectedModel],
  );

  const captureScreenshot = useCallback(async () => {
    setError(null);
    try {
      const shot = await window.almanac.captureScreen();
      setAttachedImages((prev) => [...prev, shot.dataUrl]);
      setWindowMode("expanded");
    } catch (captureError) {
      setError(
        captureError instanceof Error ? captureError.message : "Screen capture failed",
      );
    }
  }, []);

  const runCaptureSession = useCallback(async () => {
    if (captureSessionRef.current) return;
    setError(null);
    setWindowMode("expanded");
    captureSessionRef.current = true;
    setCaptureCount(0);
    const frames: string[] = [];
    try {
      for (let i = 0; i < SESSION_FRAME_COUNT; i += 1) {
        if (!captureSessionRef.current) break;
        const shot = await window.almanac.captureScreen();
        if (!captureSessionRef.current) break;
        frames.push(shot.dataUrl);
        setCaptureCount(frames.length);
        if (i < SESSION_FRAME_COUNT - 1) {
          await new Promise((resolve) => setTimeout(resolve, SESSION_FRAME_INTERVAL_MS));
        }
      }
      if (frames.length > 0) {
        setAttachedImages((prev) => [...prev, ...frames]);
      }
    } catch (sessionError) {
      setError(
        sessionError instanceof Error ? sessionError.message : "Screen capture failed",
      );
    } finally {
      captureSessionRef.current = false;
      setCaptureCount(null);
    }
  }, []);

  const cancelCaptureSession = useCallback(() => {
    captureSessionRef.current = false;
  }, []);

  const cancelStreaming = useCallback(() => {
    const id = streamingMessageIdRef.current;
    if (!id) return;
    void window.almanac?.cancelChatCompletion(id);
    streamingMessageIdRef.current = null;
    setCaptureState("idle");
  }, []);

  const clearChat = useCallback(() => {
    cancelStreaming();
    setTimeline([]);
    setInput("");
    setAttachedImages([]);
    setError(null);
  }, [cancelStreaming]);

  const recorder = usePushToTalk(async ({ blob, mimeType }) => {
    setCaptureState("transcribing");
    try {
      const transcript = await window.almanac.transcribeAudio(
        await blob.arrayBuffer(),
        mimeType,
        defaultModels.transcribe,
      );
      setCaptureState("idle");
      if (transcript.trim()) await sendMessage(transcript);
    } catch (transcriptionError) {
      setCaptureState("idle");
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "Transcription failed",
      );
    }
  });

  const toggleRecording = useCallback(async () => {
    setError(null);
    if (recorder.isRecording) {
      await recorder.stopRecording();
      return;
    }
    setCaptureState("recording");
    try {
      await recorder.startRecording();
    } catch (micError) {
      setCaptureState("idle");
      setError(micError instanceof Error ? micError.message : "Microphone access denied");
    }
  }, [recorder]);

  const startVoice = useCallback(async () => {
    setError(null);
    setWindowMode("expanded");
    if (recorder.isRecording) return;
    setCaptureState("recording");
    try {
      await recorder.startRecording();
    } catch (micError) {
      setCaptureState("idle");
      setError(micError instanceof Error ? micError.message : "Microphone access denied");
    }
  }, [recorder]);

  const collapseToCompact = useCallback(() => {
    cancelCaptureSession();
    cancelStreaming();
    setWindowMode("compact");
  }, [cancelCaptureSession, cancelStreaming]);

  const isMac = runtimeInfo?.platform === "darwin";
  const modKey = isMac ? "⌘" : "Ctrl";

  const isBusy = captureState === "streaming" || captureState === "transcribing";
  const inputDisabled = isBusy;

  const morphTransition = { type: "spring" as const, stiffness: 320, damping: 34 };

  const CARD_SIZES: Record<WindowMode, { width: number; height: number }> = {
    compact: { width: 220, height: 176 },
    notes: { width: 220, height: 176 },
    expanded: { width: 760, height: 560 },
  };
  const cardSize = CARD_SIZES[windowMode];
  const isExpanded = windowMode === "expanded";

  return (
    <div
      className={cn(
        "fixed inset-0 flex justify-center",
        isExpanded ? "items-center" : "items-start pt-2",
      )}
    >
      <motion.div
        animate={{ width: cardSize.width, height: cardSize.height }}
        initial={false}
        transition={morphTransition}
        style={{ width: cardSize.width, height: cardSize.height }}
      >
      <AnimatePresence mode="popLayout" initial={false}>
        {windowMode === "compact" ? (
          <motion.div
            key="compact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="h-full w-full"
          >
            <Suspense fallback={<LazyFallback />}>
              <CompactLauncher
                onCapture={() => void captureScreenshot()}
                onOpenChat={() => setWindowMode("expanded")}
                onVoice={() => void startVoice()}
                onScreenShare={() => void runCaptureSession()}
                voiceEnabled={VOICE_ENABLED}
                modKey={modKey}
              />
            </Suspense>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="surface-card relative flex h-full w-full flex-col overflow-hidden rounded-sm"
          >
        <header
          data-drag-region="true"
          className="flex justify-between items-center gap-3 border-b border-hairline px-4 py-3"
        >
          <div className="flex items-center" data-no-drag="true">
            <Button
              aria-label="Back to launcher"
              onClick={collapseToCompact}
              size="icon-sm"
              variant="outline"
              title="Back"
            >
              <ArrowLeft />
            </Button>
          </div>

          <div className="flex items-center justify-center" data-no-drag="true">
            <ShortcutAction
              label="Capture"
              keys={[modKey, "S"]}
              onClick={() => void captureScreenshot()}
            />
          </div>

          <div className="flex items-center justify-end gap-1.5" data-no-drag="true">
            <Button
              aria-label="Toggle voice output"
              aria-pressed={speechEnabled}
              disabled={!VOICE_ENABLED}
              onClick={() => setSpeechEnabled((v) => !v)}
              size="icon-sm"
              variant={speechEnabled ? "outline" : "ghost"}
              title={VOICE_ENABLED ? "Voice output" : "Voice output unavailable"}
            >
              {VOICE_ENABLED ? <Headphones /> : <HeadphoneOff />}
            </Button>
            <Button
              aria-label="Capture screen session"
              aria-pressed={captureCount !== null}
              disabled={captureCount !== null}
              onClick={() => void runCaptureSession()}
              size="icon-sm"
              variant={captureCount !== null ? "outline" : "ghost"}
              title={`Capture ${SESSION_FRAME_COUNT} frames over ${
                (SESSION_FRAME_COUNT - 1) * (SESSION_FRAME_INTERVAL_MS / 1000)
              }s`}
            >
              <MonitorPlay />
            </Button>
            <Button
              aria-label="Clear chat"
              onClick={clearChat}
              size="icon-sm"
              variant="ghost"
              title="Clear chat"
            >
              <Trash2 />
            </Button>
            <Button
              aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
              aria-pressed={alwaysOnTop}
              onClick={() => {
                const next = !alwaysOnTop;
                setAlwaysOnTop(next);
                void window.almanac?.setAlwaysOnTop(next);
              }}
              size="icon-sm"
              variant={alwaysOnTop ? "outline" : "ghost"}
              title="Always on top"
            >
              <Pin />
            </Button>
            <Button
              aria-label="Collapse to launcher"
              onClick={collapseToCompact}
              size="icon-sm"
              variant="ghost"
              title="Collapse"
            >
              <Minimize2 />
            </Button>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="relative z-10 flex h-full flex-col px-5 pb-4">
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="eyebrow">Today · {currentTime}</span>
              {models.length > 0 ? (
                <select
                  data-no-drag="true"
                  aria-label="Chat model"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className={cn(
                    "max-w-50 cursor-pointer rounded-pill border border-border bg-transparent px-2.5 py-0.5",
                    "font-mono text-[10px] uppercase tracking-eyebrow text-foreground/85 outline-none",
                    "transition-colors hover:bg-white/4 focus-visible:border-white/30",
                  )}
                >
                  {chatModels(models).map((model) => (
                    <option key={model.id} value={model.id} className="bg-canvas-card">
                      {model.id}
                    </option>
                  ))}
                </select>
              ) : null}
              {captureCount !== null ? (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={cancelCaptureSession}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill border border-border bg-transparent px-2.5 py-0.5",
                    "font-mono text-[10px] uppercase tracking-eyebrow text-foreground/85",
                    "transition-colors hover:bg-white/4",
                  )}
                >
                  <span className="size-1.5 animate-pulse rounded-pill bg-accent" />
                  Capturing {captureCount}/{SESSION_FRAME_COUNT}
                  <Square className="size-2.5 fill-current" />
                </button>
              ) : captureState === "listening" ? (
                <StatusPill>
                  <span className="size-1.5 animate-pulse rounded-pill bg-foreground" />
                  Listening
                </StatusPill>
              ) : captureState === "transcribing" ? (
                <StatusPill>
                  <LoaderCircle className="size-3 animate-spin" />
                  Transcribing
                </StatusPill>
              ) : captureState === "streaming" ? (
                <StatusPill>
                  <LoaderCircle className="size-3 animate-spin" />
                  Thinking
                </StatusPill>
              ) : null}
            </div>

            {deferredTimeline.length === 0 ? (
              <EmptyChat
                onPrompt={(text) => void sendMessage(text)}
                onCapture={() => void captureScreenshot()}
              />
            ) : (
              <ScrollArea className="scroll-mask min-h-0 flex-1" viewportRef={viewportRef}>
                <div className="pb-6 pr-1.5">
                  <Suspense fallback={<LazyFallback />}>
                    <Transcript items={deferredTimeline} />
                  </Suspense>
                </div>
              </ScrollArea>
            )}

            <AnimatePresence>
              {runtimeWarning ? (
                <Banner
                  key="warn"
                  tone="warning"
                  onDismiss={() => setRuntimeWarning(null)}
                >
                  {runtimeWarning}
                </Banner>
              ) : null}
              {updateStatus ? (
                <Banner key="upd" tone="info" onDismiss={() => setUpdateStatus(null)}>
                  {updateStatus}
                </Banner>
              ) : null}
              {error ? (
                <Banner key="err" tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Banner>
              ) : null}
            </AnimatePresence>

            <Composer
              value={input}
              disabled={inputDisabled}
              recording={recorder.isRecording}
              busy={isBusy}
              attachedImages={attachedImages}
              voiceEnabled={VOICE_ENABLED}
              onChange={setInput}
              onSubmit={() => void sendMessage(input)}
              onToggleRecord={() => void toggleRecording()}
              onRemoveImage={(index) =>
                setAttachedImages((prev) => prev.filter((_, i) => i !== index))
              }
            />

          </div>
        </div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </div>
  );
}

const Composer = memo(
  Object.assign(
    function ComposerImpl(props: {
      value: string;
      disabled: boolean;
      recording: boolean;
      busy: boolean;
      attachedImages: string[];
      voiceEnabled: boolean;
      onChange: (v: string) => void;
      onSubmit: () => void;
      onToggleRecord: () => void;
      onRemoveImage: (index: number) => void;
    }) {
      const {
        value,
        disabled,
        recording,
        busy,
        attachedImages,
        voiceEnabled,
        onChange,
        onSubmit,
        onToggleRecord,
        onRemoveImage,
      } = props;
      const canSend = (Boolean(value.trim()) || attachedImages.length > 0) && !busy;
      return (
        <div className="flex flex-col gap-2">
          {attachedImages.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 self-start" data-no-drag="true">
              {attachedImages.map((img, index) => (
                <div
                  key={`${index}-${img.slice(-16)}`}
                  className="group relative overflow-hidden rounded-xs border border-hairline"
                >
                  <img
                    src={img}
                    alt={`Screen frame ${index + 1}`}
                    className="h-12 w-20 object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove frame ${index + 1}`}
                    onClick={() => onRemoveImage(index)}
                    className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-pill bg-black/70 text-foreground/80 transition hover:text-foreground"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div
            className={cn(
              "relative flex items-center gap-1 rounded-pill border border-border bg-transparent py-1 pl-5 pr-1",
              "transition-colors focus-within:border-white/30",
            )}
          >
          <textarea
            aria-label="Message Alma"
            data-no-drag="true"
            disabled={disabled}
            maxLength={2000}
            rows={1}
            value={value}
            placeholder="Type your message"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className={cn(
              "max-h-28 min-h-7 flex-1 resize-none border-0 bg-transparent py-1.5",
              "font-sans text-[14px] leading-6 text-foreground outline-none",
              "placeholder:text-muted-foreground",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
          <Button
            aria-label={recording ? "Stop recording" : "Hold to talk"}
            aria-pressed={recording}
            disabled={!voiceEnabled}
            onClick={onToggleRecord}
            size="icon"
            variant="ghost"
            title={voiceEnabled ? undefined : "Voice input unavailable"}
            className={cn(recording && "animate-pulse-ring text-destructive")}
          >
            {voiceEnabled ? <Mic /> : <MicOff />}
          </Button>
          <Button
            aria-label={busy ? "Working" : "Send message"}
            disabled={!canSend}
            onClick={onSubmit}
            size="icon"
            variant={canSend ? "primary" : "outline"}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <SendHorizonal />}
          </Button>
          </div>
        </div>
      );
    },
    { displayName: "Composer" },
  ),
);

const EMPTY_CHAT_PROMPTS = [
  "What can you help me with?",
  "Summarize what's on my screen",
  "Draft a short reply to a message",
];

function EmptyChat({
  onPrompt,
  onCapture,
}: {
  onPrompt: (text: string) => void;
  onCapture: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <AlmaAvatar size={52} glow />
      <div className="flex flex-col gap-1.5">
        <p className="font-sans text-[16px] text-foreground">How can I help?</p>
        <p className="max-w-xs font-sans text-[13px] leading-5 text-muted-foreground">
          Ask anything, or capture your screen to chat about what you see.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2">
        {EMPTY_CHAT_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            data-no-drag="true"
            onClick={() => onPrompt(prompt)}
            className={cn(
              "rounded-pill border border-border bg-transparent px-4 py-1.5",
              "font-sans text-[13px] text-foreground/85 transition-colors hover:bg-white/4",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {prompt}
          </button>
        ))}
        <button
          type="button"
          data-no-drag="true"
          onClick={onCapture}
          className={cn(
            "mt-1 inline-flex items-center justify-center gap-2 rounded-pill px-4 py-1.5",
            "font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground",
            "transition-colors hover:text-foreground",
          )}
        >
          <MonitorPlay className="size-3.5" />
          Capture screen
        </button>
      </div>
    </div>
  );
}

function ShortcutAction({
  label,
  keys,
  onClick,
}: {
  label: string;
  keys: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-no-drag="true"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border border-border bg-transparent px-3 py-1.5",
        "font-sans text-[13px] text-foreground transition-colors",
        "hover:bg-white/4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </button>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-border bg-transparent px-2 py-0.5",
        "font-mono text-[10px] uppercase tracking-eyebrow text-foreground/85",
      )}
    >
      {children}
    </span>
  );
}
