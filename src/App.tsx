import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  CornerUpLeft,
  HeadphoneOff,
  Headphones,
  LoaderCircle,
  Mic,
  Minimize2,
  Monitor,
  MonitorPlay,
  Moon,
  Pin,
  Settings,
  Square,
  Sun,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
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
  ThemeSource,
  TimelineItem,
  WindowMode,
} from "@shared/ipc";
import { timelineItemSchema } from "@shared/ipc";
import { sanitizeMultilineText } from "@shared/sanitize";

import { AlmaAvatar } from "@/components/AlmaAvatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompactLauncher } from "@/features/assistant/CompactLauncher";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import {
  matchMeetingWorkflow,
  startNotesTimeline,
} from "@/lib/mockMeetingAdapter";
import { cn, createId, formatClock, normalizePrompt } from "@/lib/utils";

const Transcript = lazy(async () =>
  import("@/features/assistant/Transcript").then((m) => ({ default: m.Transcript })),
);

// The window is a single fixed stage (see CARD_SIZES in electron/window.ts);
// this surface morphs between three sizes inside it — no OS resize, no flicker.
const ORB_SIZE = 56;
const SURFACE_SIZE: Record<WindowMode, { w: number; h: number }> = {
  orb: { w: ORB_SIZE, h: ORB_SIZE },
  compact: { w: 200, h: 134 },
  notes: { w: 200, h: 134 },
  expanded: { w: 768, h: 568 },
};

// A firm, barely-bouncy spring — the box visibly *morphs* between modes.
const MORPH = { type: "spring" as const, stiffness: 360, damping: 34, mass: 0.85 };

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

const MEETING_PROMPT = {
  title: "Start Alma Notes",
  description: "Take notes & get suggestions in real time",
  actionLabel: "Take Notes",
};

const SYSTEM_PROMPT =
  "You are Alma, a concise, proactive desktop assistant for meetings, notes, and scheduling. Be terse, warm, and lowercase.";

// After a message is sent, wait this long for the user to stop sending before
// Alma processes the whole burst — "batch until I pause".
const BATCH_PAUSE_MS = 1400;

// Stagger between mocked demo replies when a batch matches several workflows.
const MOCK_REPLY_STAGGER_MS = 320;

// Builds the LLM message list from the timeline, carrying image attachments
// through as content parts so a batched request keeps every screen capture.
function buildChatMessages(
  items: TimelineItem[],
): { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] }[] {
  const messages: {
    role: "system" | "user" | "assistant";
    content: string | ChatContentPart[];
  }[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const item of items) {
    if (item.kind !== "message" || item.message.role === "system") continue;
    const { role, content, imageUrls } = item.message;
    const text = content.trim();
    if (imageUrls && imageUrls.length > 0) {
      messages.push({
        role,
        content: [
          { type: "text", text: text || "(screen capture)" },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      });
    } else if (text) {
      messages.push({ role, content: text });
    }
  }
  return messages;
}

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
          className="-mr-1 flex size-5 items-center justify-center rounded-pill text-foreground/60 transition hover:bg-hover hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </motion.div>
  );
}

export default function App() {
  const [windowMode, setWindowMode] = useState<WindowMode>("orb");
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>(() => loadPersistedTimeline());
  const [input, setInput] = useState("");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [themeSource, setThemeSource] = useState<ThemeSource>("system");
  const [error, setError] = useState<string | null>(null);
  const [runtimeWarning, setRuntimeWarning] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => formatClock());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<TimelineItem[]>(timeline);
  const speechEnabledRef = useRef(false);
  const hasBootstrappedRef = useRef(false);
  const streamingMessageIdRef = useRef<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [captureCount, setCaptureCount] = useState<number | null>(null);
  const captureSessionRef = useRef(false);
  // Id of the message the next send will reply to (null = not replying).
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredTimeline = useDeferredValue(timeline);

  useEffect(() => {
    speechEnabledRef.current = speechEnabled;
  }, [speechEnabled]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatClock()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Expose the active mode on <html> so CSS can strip the glass card while the
  // idle orb is showing (see [data-mode="orb"] in index.css).
  useEffect(() => {
    document.documentElement.dataset.mode = windowMode;
  }, [windowMode]);

  // Clicking outside the window (anything that takes focus away) collapses the
  // compact launcher back to the idle orb.
  useEffect(() => {
    if (windowMode !== "compact") return;
    const collapse = () =>
      setWindowMode((mode) => (mode === "compact" ? "orb" : mode));
    window.addEventListener("blur", collapse);
    return () => window.removeEventListener("blur", collapse);
  }, [windowMode]);

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

  // Resolved light/dark drives [data-theme] on <html>; platform attributes
  // tell the CSS whether the OS supplies the blur (acrylic / vibrancy).
  const applyResolvedTheme = useCallback(
    (info: { source: ThemeSource; shouldUseDarkColors: boolean }) => {
      setThemeSource(info.source);
      document.documentElement.dataset.theme = info.shouldUseDarkColors
        ? "dark"
        : "light";
    },
    [],
  );

  const changeTheme = useCallback(
    async (source: ThemeSource) => {
      const info = await window.almanac?.setTheme(source);
      if (info) applyResolvedTheme(info);
    },
    [applyResolvedTheme],
  );

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
      almanac.getTheme().catch(() => null),
    ])
      .then(([runtime, state, available, theme]) => {
        if (!active) return;
        setRuntimeInfo(runtime);
        setWindowMode(state.mode);
        setAlwaysOnTop(state.alwaysOnTop);
        setModels(available);
        setSelectedModel(pickChatModel(available, runtime.config.defaultChatModel));
        // Lets CSS match the card radius to each platform's native window
        // corner rounding (see [data-platform] rules in index.css).
        document.documentElement.dataset.platform = runtime.platform;
        if (theme) applyResolvedTheme(theme);
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
      if (event.type === "theme") applyResolvedTheme(event.theme);
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

  // The window is a fixed full-size, transparent stage. Forward the mouse
  // through its transparent regions so clicks reach whatever is behind Almanac,
  // and only capture them while the pointer is over the surface (or a popover
  // portalled out of it). Pointer-move events keep arriving even while
  // click-through is on (`forward: true`), so re-entry is always detected.
  useEffect(() => {
    let ignoring: boolean | null = null;
    const apply = (ignore: boolean) => {
      if (ignore === ignoring) return;
      ignoring = ignore;
      void window.almanac?.setMouseIgnore(ignore);
    };
    apply(true);
    const onMove = (event: MouseEvent) => {
      apply(event.target === backdropRef.current);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      void window.almanac?.setMouseIgnore(false);
    };
  }, []);

  const appendTimeline = useCallback((items: TimelineItem[]) => {
    setTimeline((current) => [...current, ...items]);
  }, []);

  // The text/preview of the message the composer is replying to.
  const replyPreview = useMemo(() => {
    if (!replyTo) return null;
    const found = timeline.find(
      (item) => item.kind === "message" && item.message.id === replyTo,
    );
    if (!found || found.kind !== "message") return null;
    const text = found.message.content.trim();
    if (text) return text;
    return found.message.imageUrls && found.message.imageUrls.length > 0
      ? "Image"
      : "Message";
  }, [replyTo, timeline]);

  const startNotes = useCallback(() => {
    setCaptureState("listening");
    appendTimeline(startNotesTimeline());
  }, [appendTimeline]);

  useEffect(() => {
    const off = window.almanac?.onNotificationStartNotes?.(() => startNotes());
    return () => off?.();
  }, [startNotes]);

  // Processes every message sent since Alma last replied. Demo workflows still
  // resolve per message; everything else goes to one LLM call. Each reply is
  // tagged with `replyToId` so the transcript quotes what it answers.
  const flushBatch = useCallback(async () => {
    const items = timelineRef.current;
    let lastAssistant = -1;
    items.forEach((item, index) => {
      if (item.kind === "message" && item.message.role === "assistant") {
        lastAssistant = index;
      }
    });
    const pending = items
      .slice(lastAssistant + 1)
      .flatMap((item) =>
        item.kind === "message" && item.message.role === "user"
          ? [item.message]
          : [],
      );
    if (pending.length === 0) return;

    const unmatched: typeof pending = [];
    let stagger = 0;
    for (const message of pending) {
      const hasImages = Boolean(message.imageUrls && message.imageUrls.length > 0);
      if (DEMO_MODE && !hasImages) {
        const mocked = matchMeetingWorkflow(message.content);
        if (mocked) {
          const tagged = mocked.map((item, index) =>
            index === 0 && item.kind === "message"
              ? { ...item, message: { ...item.message, replyToId: message.id } }
              : item,
          );
          const at = stagger;
          window.setTimeout(() => appendTimeline(tagged), at);
          stagger += MOCK_REPLY_STAGGER_MS;
          continue;
        }
      }
      unmatched.push(message);
    }
    if (unmatched.length === 0) return;

    const assistantId = createId("assistant");
    appendTimeline([
      buildTimelineMessage("assistant", "", {
        id: assistantId,
        source: "litellm",
        replyToId: unmatched[0].id,
      }),
    ]);
    setCaptureState("streaming");
    streamingMessageIdRef.current = assistantId;

    try {
      await window.almanac.startChatCompletion({
        messageId: assistantId,
        model: selectedModel || pickChatModel(models, runtimeInfo?.config.defaultChatModel),
        messages: buildChatMessages(timelineRef.current),
      });
    } catch (streamError) {
      setCaptureState("idle");
      streamingMessageIdRef.current = null;
      setError(streamError instanceof Error ? streamError.message : "Unable to start chat");
    }
  }, [appendTimeline, models, runtimeInfo, selectedModel]);

  const sendMessage = useCallback(
    (raw: string) => {
      const trimmed = normalizePrompt(raw);
      const images = attachedImages;
      if (!trimmed && images.length === 0) return;

      setError(null);
      appendTimeline([
        buildTimelineMessage("user", trimmed, {
          status: "read",
          source: "mock",
          imageUrls: images.length > 0 ? images : undefined,
          replyToId: replyTo ?? undefined,
        }),
      ]);
      setInput("");
      setAttachedImages([]);
      setReplyTo(null);

      // Hold off processing until the user pauses — multiple quick sends are
      // answered together once the timer elapses.
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(() => {
        batchTimerRef.current = null;
        void flushBatch();
      }, BATCH_PAUSE_MS);
    },
    [appendTimeline, attachedImages, flushBatch, replyTo],
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
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    setTimeline([]);
    setInput("");
    setAttachedImages([]);
    setReplyTo(null);
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

  // One persistent, top-anchored surface holds every mode. It morphs its own
  // size between the orb, the compact launcher and the full chat — the three
  // faces below cross-fade inside it — so chat never feels like a separate
  // window. The OS window is a fixed, transparent stage that never resizes;
  // only this surface morphs, so mode changes never flicker.
  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 flex items-start justify-center glass-body"
    >
      <motion.div
        className="launcher-surface relative overflow-hidden"
        initial={false}
        animate={{
          width: SURFACE_SIZE[windowMode].w,
          height: SURFACE_SIZE[windowMode].h,
          borderRadius: windowMode === "orb" ? ORB_SIZE / 2 : 16,
        }}
        transition={MORPH}
      >
        {/* Orb face — click to spring open into the compact launcher. */}
        <motion.div
          role="button"
          tabIndex={windowMode === "orb" ? 0 : -1}
          aria-label="Open Alma launcher"
          aria-hidden={windowMode !== "orb"}
          inert={windowMode !== "orb"}
          initial={false}
          animate={{ opacity: windowMode === "orb" ? 1 : 0 }}
          transition={{ duration: 0.16 }}
          style={{ pointerEvents: windowMode === "orb" ? "auto" : "none" }}
          className="absolute inset-0 flex items-start justify-center"
          onClick={() => {
            if (windowMode === "orb") setWindowMode("compact");
          }}
          onKeyDown={(e) => {
            if (windowMode === "orb" && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setWindowMode("compact");
            }
          }}
        >
          <div
            className="relative grid place-items-center"
            style={{ width: ORB_SIZE, height: ORB_SIZE }}
          >
            <span className="alma-orb-ring" aria-hidden />
            <AlmaAvatar size={28} glow={false} />
          </div>
        </motion.div>

        {/* Compact face — the launcher shortcuts. */}
        <motion.div
          aria-hidden={windowMode !== "compact"}
          inert={windowMode !== "compact"}
          initial={false}
          animate={{ opacity: windowMode === "compact" ? 1 : 0 }}
          transition={{ duration: 0.16, delay: windowMode === "compact" ? 0.05 : 0 }}
          style={{
            width: SURFACE_SIZE.compact.w,
            height: SURFACE_SIZE.compact.h,
            pointerEvents: windowMode === "compact" ? "auto" : "none",
          }}
          className="absolute left-1/2 top-0 -translate-x-1/2"
        >
          <CompactLauncher
            onCapture={() => void captureScreenshot()}
            onOpenChat={() => setWindowMode("expanded")}
            onVoice={() => void startVoice()}
            onScreenShare={() => void runCaptureSession()}
            onNotes={() => void window.almanac?.showNotification(MEETING_PROMPT)}
            voiceEnabled={VOICE_ENABLED}
            modKey={modKey}
          />
        </motion.div>

        {/* Chat face — the full conversation surface. */}
        <motion.div
          aria-hidden={windowMode !== "expanded"}
          inert={windowMode !== "expanded"}
          initial={false}
          animate={{ opacity: windowMode === "expanded" ? 1 : 0 }}
          transition={{ duration: 0.18, delay: windowMode === "expanded" ? 0.06 : 0 }}
          style={{
            width: SURFACE_SIZE.expanded.w,
            height: SURFACE_SIZE.expanded.h,
            pointerEvents: windowMode === "expanded" ? "auto" : "none",
          }}
          className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col overflow-hidden"
        >
        <header
          data-drag-region="true"
          // `glass-header`'s backdrop-filter makes this a stacking context, so
          // the settings popover is confined to the header's layer. Lift the
          // header above the chat content (z-10) so the popover sits on top
          // and stays clickable.
          className="glass-header relative z-20 flex items-center justify-between gap-2 border-b border-hairline px-2.5 py-2"
        >
          <button
            type="button"
            data-no-drag="true"
            onClick={collapseToCompact}
            title="Back to launcher"
            className={cn(
              "flex items-center gap-2 rounded-pill px-2 py-1 transition-colors",
              "hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="font-sans text-[13px] font-medium text-foreground">
              Ask Alma
            </span>
            <span className="flex items-center gap-1">
              <Kbd>{modKey}</Kbd>
              <Kbd>↵</Kbd>
            </span>
          </button>

          <div className="flex items-center justify-center" data-no-drag="true">
            <ShortcutAction
              label="Capture"
              keys={[modKey, "S"]}
              onClick={() => void captureScreenshot()}
            />
          </div>

          <div className="flex items-center justify-end gap-0.5" data-no-drag="true">
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
            <SettingsMenu
              themeSource={themeSource}
              onThemeChange={(source) => void changeTheme(source)}
              alwaysOnTop={alwaysOnTop}
              onToggleAlwaysOnTop={() => {
                const next = !alwaysOnTop;
                setAlwaysOnTop(next);
                void window.almanac?.setAlwaysOnTop(next);
              }}
              onClearChat={clearChat}
            />
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
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger
                    aria-label="Chat model"
                    className="max-w-50 cursor-pointer font-mono text-[10px] uppercase tracking-eyebrow whitespace-nowrap truncate"
                  >
                    <SelectValue
                      placeholder="Select model"
                      className="min-w-0 flex-1 truncate text-left whitespace-nowrap"
                    >
                      {selectedModel || "Select model"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="font-mono text-[11px]">
                    {chatModels(models).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {captureCount !== null ? (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={cancelCaptureSession}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill border border-border bg-transparent px-2.5 py-0.5",
                    "font-mono text-[10px] uppercase tracking-eyebrow text-foreground/85",
                    "transition-colors hover:bg-hover",
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
                    <Transcript
                      items={deferredTimeline}
                      onReply={(id) => setReplyTo(id)}
                    />
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
              replyPreview={replyPreview}
              onChange={setInput}
              onSubmit={() => void sendMessage(input)}
              onToggleRecord={() => void toggleRecording()}
              onCancelReply={() => setReplyTo(null)}
              onRemoveImage={(index) =>
                setAttachedImages((prev) => prev.filter((_, i) => i !== index))
              }
            />

          </div>
        </div>
        </motion.div>
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
      replyPreview: string | null;
      onChange: (v: string) => void;
      onSubmit: () => void;
      onToggleRecord: () => void;
      onCancelReply: () => void;
      onRemoveImage: (index: number) => void;
    }) {
      const {
        value,
        disabled,
        recording,
        busy,
        attachedImages,
        voiceEnabled,
        replyPreview,
        onChange,
        onSubmit,
        onToggleRecord,
        onCancelReply,
        onRemoveImage,
      } = props;
      const canSend = (Boolean(value.trim()) || attachedImages.length > 0) && !busy;
      return (
        <div className="flex flex-col gap-2">
          {replyPreview ? (
            <div
              data-no-drag="true"
              className="flex items-center gap-1.5 self-start rounded-md border border-hairline bg-hover px-2 py-1"
            >
              <CornerUpLeft className="size-3 shrink-0 text-muted-foreground" />
              <span className="max-w-60 truncate font-sans text-[12px] text-muted-foreground">
                Replying to: {replyPreview}
              </span>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={onCancelReply}
                className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-pill text-foreground/60 transition hover:bg-canvas-mid hover:text-foreground"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ) : null}
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
              "relative flex items-center gap-1 rounded-pill border border-border bg-input py-1 pl-5 pr-1",
              "transition-colors focus-within:border-ring",
            )}
          >
          <textarea
            aria-label="Message Alma"
            data-no-drag="true"
            disabled={disabled}
            maxLength={2000}
            rows={1}
            value={value}
            placeholder="Type your message…"
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
          {voiceEnabled ? (
            <Button
              aria-label={recording ? "Stop recording" : "Hold to talk"}
              aria-pressed={recording}
              onClick={onToggleRecord}
              size="icon"
              variant="ghost"
              className={cn(recording && "animate-pulse-ring text-destructive")}
            >
              <Mic />
            </Button>
          ) : null}
          <Button
            aria-label={busy ? "Working" : "Send message"}
            disabled={!canSend}
            onClick={onSubmit}
            size="icon"
            variant={canSend ? "accent" : "outline"}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
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
        {EMPTY_CHAT_PROMPTS.map((prompt, index) => (
          <motion.button
            key={prompt}
            type="button"
            data-no-drag="true"
            onClick={() => onPrompt(prompt)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: 0.08 + index * 0.07,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "rounded-pill border border-border bg-transparent px-4 py-1.5",
              "font-sans text-[13px] text-foreground/85 transition-colors hover:bg-hover",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {prompt}
          </motion.button>
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
        "inline-flex items-center gap-2 rounded-pill bg-transparent px-3 py-1.5",
        "font-sans text-[13px] text-foreground transition-colors",
        "hover:bg-hover",
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

const THEME_OPTIONS: { value: ThemeSource; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function SettingsMenu({
  themeSource,
  onThemeChange,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onClearChat,
}: {
  themeSource: ThemeSource;
  onThemeChange: (source: ThemeSource) => void;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onClearChat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" data-no-drag="true">
      <Button
        aria-label="Settings"
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
        size="icon-sm"
        variant={open ? "outline" : "ghost"}
        title="Settings"
      >
        <Settings />
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            data-no-drag="true"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="glass-popover absolute right-0 top-9 z-50 w-52 rounded-md p-2"
          >
            <p className="eyebrow px-1.5 pb-1.5">Appearance</p>
            <div className="flex gap-1">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onThemeChange(value)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-sm border px-1 py-1.5",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    themeSource === value
                      ? "border-border bg-hover text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="font-sans text-[11px]">{label}</span>
                </button>
              ))}
            </div>
            <div className="my-1.5 h-px bg-hairline" />
            <MenuRow onClick={onToggleAlwaysOnTop}>
              <span className="flex items-center gap-2">
                <Pin className="size-3.5" />
                Always on top
              </span>
              {alwaysOnTop ? <Check className="size-3.5 text-foreground" /> : null}
            </MenuRow>
            <MenuRow
              onClick={() => {
                onClearChat();
                setOpen(false);
              }}
            >
              <span className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-3.5" />
                Clear chat
              </span>
            </MenuRow>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MenuRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1.5",
        "font-sans text-[12.5px] text-foreground/90 transition-colors",
        "hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {children}
    </button>
  );
}
