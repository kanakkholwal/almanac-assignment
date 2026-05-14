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
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Headphones,
  LoaderCircle,
  Mic,
  Minimize2,
  MonitorUp,
  Pin,
  SendHorizonal,
  TriangleAlert,
  X,
} from "lucide-react";

import type {
  AppRuntimeInfo,
  AssistantMessage,
  CaptureState,
  ModelOption,
  TimelineItem,
  WindowMode,
} from "@shared/ipc";
import { timelineItemSchema } from "@shared/ipc";
import { SEEDED_TIMELINE } from "@shared/mock-data";
import { sanitizeMultilineText } from "@shared/sanitize";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import {
  matchMeetingWorkflow,
  startNotesTimeline,
} from "@/lib/mockMeetingAdapter";

const NOTIFICATION_PAYLOAD = {
  title: "Start Alma Notes",
  description: "Take notes & get suggestions in real time",
  actionLabel: "Take Notes",
};
import { cn, createId, formatClock, normalizePrompt } from "@/lib/utils";

const CompactLauncher = lazy(async () =>
  import("@/features/assistant/CompactLauncher").then((m) => ({
    default: m.CompactLauncher,
  })),
);
const Transcript = lazy(async () =>
  import("@/features/assistant/Transcript").then((m) => ({ default: m.Transcript })),
);
const NotesPill = lazy(async () =>
  import("@/features/notes/NotesPill").then((m) => ({ default: m.NotesPill })),
);

const STORAGE_KEY = "almanac.timeline.v1";

const defaultModels = {
  chat: import.meta.env.VITE_DEFAULT_CHAT_MODEL || "gpt-4o-mini",
  transcribe: import.meta.env.VITE_DEFAULT_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
  speech: import.meta.env.VITE_DEFAULT_TTS_MODEL || "gpt-4o-mini-tts",
};

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

function loadSeedTimeline(): TimelineItem[] {
  if (typeof window === "undefined") return SEEDED_TIMELINE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return SEEDED_TIMELINE;
  try {
    const parsed = JSON.parse(stored) as unknown[];
    const items = parsed
      .map((item) => timelineItemSchema.safeParse(item))
      .filter((item) => item.success)
      .map((item) => item.data);
    return items.length > 0 ? items : SEEDED_TIMELINE;
  } catch {
    return SEEDED_TIMELINE;
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
  const [timeline, setTimeline] = useState<TimelineItem[]>(() => loadSeedTimeline());
  const [input, setInput] = useState("");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [models, setModels] = useState<ModelOption[]>([]);
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
        .map((item) => ({ role: item.message.role, content: item.message.content })),
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
      if (!trimmed) return;

      setError(null);
      const userItem = buildTimelineMessage("user", trimmed, {
        status: "read",
        source: "mock",
      });

      appendTimeline([userItem]);
      setInput("");

      const mocked = matchMeetingWorkflow(trimmed);
      if (mocked) {
        window.setTimeout(() => appendTimeline(mocked), 280);
        return;
      }

      const assistantId = createId("assistant");
      const placeholder = buildTimelineMessage("assistant", "", {
        id: assistantId,
        source: "litellm",
      });

      appendTimeline([placeholder]);
      setCaptureState("streaming");

      try {
        await window.almanac.startChatCompletion({
          messageId: assistantId,
          model: models[0]?.id || defaultModels.chat,
          messages: [
            {
              role: "system",
              content:
                "You are Alma, a concise, proactive desktop assistant for meetings, notes, and scheduling. Be terse, warm, and lowercase.",
            },
            ...messageHistory,
            { role: "user", content: trimmed },
          ],
        });
      } catch (streamError) {
        setCaptureState("idle");
        setError(streamError instanceof Error ? streamError.message : "Unable to start chat");
      }
    },
    [appendTimeline, messageHistory, models],
  );

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

  const isMac = runtimeInfo?.platform === "darwin";
  const modKey = isMac ? "⌘" : "Ctrl";

  const isBusy = captureState === "streaming" || captureState === "transcribing";
  const inputDisabled = isBusy;

  const morphTransition = { type: "spring" as const, stiffness: 320, damping: 34 };

  const CARD_SIZES: Record<WindowMode, { width: number; height: number }> = {
    compact: { width: 220, height: 176 },
    notes: { width: 220, height: 176 },
    expanded: { width: 1120, height: 560 },
  };
  const cardSize = CARD_SIZES[windowMode];

  return (
    <div className="fixed inset-0 flex justify-center pt-2">
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
                onCapture={() => void window.almanac?.notesShow()}
                onOpenChat={() => setWindowMode("expanded")}
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
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-hairline px-4 py-3"
        >
          <div className="flex items-center" data-no-drag="true">
            <ShortcutAction
              label="Ask Alma"
              keys={[modKey, "↵"]}
              onClick={() => {/* focus is on input by default */}}
            />
          </div>

          <div className="flex items-center justify-center" data-no-drag="true">
            <ShortcutAction
              label="Capture"
              keys={[modKey, "S"]}
              onClick={() => void window.almanac?.notesShow()}
            />
          </div>

          <div className="flex items-center justify-end gap-1.5" data-no-drag="true">
            <Button
              aria-label="Toggle voice output"
              aria-pressed={speechEnabled}
              onClick={() => setSpeechEnabled((v) => !v)}
              size="icon-sm"
              variant={speechEnabled ? "outline" : "ghost"}
              title="Voice output"
            >
              <Headphones />
            </Button>
            <Button
              aria-label="Capture screen"
              onClick={() => void window.almanac?.notesShow()}
              size="icon-sm"
              variant="ghost"
              title="Capture screen"
            >
              <MonitorUp />
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
              onClick={() => setWindowMode("compact")}
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
              {captureState === "listening" ? (
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

            <ScrollArea className="scroll-mask min-h-0 flex-1" viewportRef={viewportRef}>
              <div className="pb-6 pr-1.5">
                <Suspense fallback={<LazyFallback />}>
                  <Transcript items={deferredTimeline} />
                </Suspense>
              </div>
            </ScrollArea>

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
              busyState={captureState}
              onChange={setInput}
              onSubmit={() => void sendMessage(input)}
              onToggleRecord={() => void toggleRecording()}
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
      busyState: CaptureState;
      onChange: (v: string) => void;
      onSubmit: () => void;
      onToggleRecord: () => void;
    }) {
      const { value, disabled, recording, busy, busyState, onChange, onSubmit, onToggleRecord } =
        props;
      const canSend = Boolean(value.trim()) && !busy;
      return (
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
            onClick={onToggleRecord}
            size="icon"
            variant="ghost"
            className={cn(recording && "animate-pulse-ring text-destructive")}
          >
            {busyState === "transcribing" || busyState === "streaming" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Mic />
            )}
          </Button>
          <Button
            aria-label="Send message"
            disabled={!canSend}
            onClick={onSubmit}
            size="icon"
            variant={canSend ? "primary" : "outline"}
          >
            <SendHorizonal />
          </Button>
        </div>
      );
    },
    { displayName: "Composer" },
  ),
);

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
