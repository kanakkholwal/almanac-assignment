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
  Settings,
  Sparkles,
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
  WindowState,
} from "@shared/ipc";
import { timelineItemSchema } from "@shared/ipc";
import { SEEDED_TIMELINE } from "@shared/mock-data";
import { sanitizeMultilineText } from "@shared/sanitize";

import { WindowControls } from "@/components/WindowControls";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import {
  getInitialNotification,
  matchMeetingWorkflow,
  startNotesTimeline,
  type MeetingNotification,
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
const MeetingPrompt = lazy(async () =>
  import("@/features/meeting/MeetingPrompt").then((m) => ({ default: m.MeetingPrompt })),
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
  { wrapper: string; icon: typeof AlertCircle; iconClass: string }
> = {
  warning: {
    wrapper: "border-accent/25 bg-accent/10 text-accent-foreground",
    icon: TriangleAlert,
    iconClass: "text-accent",
  },
  info: {
    wrapper: "border-border bg-card/70 text-foreground/85",
    icon: CheckCircle2,
    iconClass: "text-primary",
  },
  error: {
    wrapper: "border-destructive/30 bg-destructive/10 text-destructive-foreground",
    icon: AlertCircle,
    iconClass: "text-destructive",
  },
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
        "mb-2 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs",
        tokens.wrapper,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", tokens.iconClass)} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {onDismiss ? (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mr-1 flex size-5 items-center justify-center rounded text-current/70 transition hover:bg-white/10 hover:text-current"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </motion.div>
  );
}

export default function App() {
  const [windowMode, setWindowMode] = useState<WindowMode>("expanded");
  const [windowState, setWindowState] = useState<WindowState | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>(() => loadSeedTimeline());
  const [input, setInput] = useState("");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [notification, setNotification] = useState<MeetingNotification | null>(null);
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
    const promptTimer = window.setTimeout(() => setNotification(getInitialNotification()), 1400);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(promptTimer);
    };
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
        setWindowState(state);
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
        setWindowState(event.state);
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
    setNotification(null);
    setCaptureState("listening");
    appendTimeline(startNotesTimeline());
  }, [appendTimeline]);

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
  const platformLabel = isMac
    ? "macOS"
    : runtimeInfo?.platform === "linux"
      ? "Linux"
      : "Windows";

  const isBusy = captureState === "streaming" || captureState === "transcribing";
  const inputDisabled = isBusy;

  if (windowMode === "compact") {
    return (
      <div className="h-screen w-screen bg-transparent p-1">
        <Suspense fallback={<LazyFallback />}>
          <CompactLauncher
            onCapture={() => {
              setNotification(getInitialNotification());
              setWindowMode("expanded");
            }}
            onOpenChat={() => setWindowMode("expanded")}
            modKey={modKey}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-transparent p-2 sm:p-3">
      <motion.div
        layoutId="alma-shell"
        className="glass-panel surface-ambient relative flex h-full w-full flex-col overflow-hidden rounded-2xl sm:rounded-3xl"
      >
        <Suspense fallback={null}>
          <MeetingPrompt
            onDismiss={() => setNotification(null)}
            onStart={startNotes}
            prompt={notification}
          />
        </Suspense>

        <header
          data-drag-region="true"
          className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-2"
        >
          <div className="flex items-center gap-2" data-no-drag="true">
            <WindowControls runtime={runtimeInfo} windowState={windowState} />
            <Separator orientation="vertical" className="mx-1 h-4" />
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
              >
                <Sparkles className="size-3" />
              </span>
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
                Alma
              </span>
              <span className="text-[11px] text-muted-foreground" aria-hidden>
                · {currentTime}
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-1 md:flex" data-no-drag="true">
            <HeaderShortcut keys={[modKey, "↵"]} label="Ask" />
            <HeaderShortcut keys={[modKey, "S"]} label="Capture" />
          </div>

          <div className="flex items-center gap-0.5" data-no-drag="true">
            <Button
              aria-label="Toggle voice output"
              aria-pressed={speechEnabled}
              onClick={() => setSpeechEnabled((v) => !v)}
              size="icon-sm"
              variant={speechEnabled ? "default" : "ghost"}
              title="Voice output"
            >
              <Headphones />
            </Button>
            <Button
              aria-label="Capture screen"
              onClick={() => setNotification(getInitialNotification())}
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
              variant={alwaysOnTop ? "default" : "ghost"}
              title="Always on top"
            >
              <Pin />
            </Button>
            <Button
              aria-label="Settings"
              size="icon-sm"
              variant="ghost"
              title="Settings"
              onClick={() => {/* placeholder */}}
            >
              <Settings />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-4" />
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
          <div className="relative z-10 flex h-full flex-col px-3 pb-3 sm:px-5 sm:pb-4">
            <div className="flex items-center justify-center py-2.5">
              {captureState === "listening" ? (
                <StatusPill tone="success">
                  <span className="size-1.5 animate-pulse rounded-full bg-success" />
                  Listening…
                </StatusPill>
              ) : captureState === "transcribing" ? (
                <StatusPill tone="info">
                  <LoaderCircle className="size-3 animate-spin" />
                  Transcribing…
                </StatusPill>
              ) : captureState === "streaming" ? (
                <StatusPill tone="info">
                  <LoaderCircle className="size-3 animate-spin" />
                  Thinking…
                </StatusPill>
              ) : null}
              {windowState?.isMaximized ? (
                <StatusPill tone="muted">Maximized</StatusPill>
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

            {runtimeInfo ? (
              <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                <span>{platformLabel}</span>
                <span aria-hidden>·</span>
                <span>v{runtimeInfo.appVersion}</span>
                <span aria-hidden>·</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    runtimeInfo.config.apiKeyPresent ? "text-success" : "text-destructive",
                  )}
                >
                  <span
                    className={cn(
                      "size-1 rounded-full",
                      runtimeInfo.config.apiKeyPresent ? "bg-success" : "bg-destructive",
                    )}
                  />
                  {runtimeInfo.config.apiKeyPresent ? "API ready" : "No API key"}
                </span>
              </div>
            ) : null}
          </div>
        </div>
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
      return (
        <div
          className={cn(
            "group/composer relative flex items-end gap-2 rounded-2xl border border-border bg-card/70 p-1.5 pl-3.5",
            "shadow-sm transition-colors focus-within:border-primary/40 focus-within:bg-card/85",
          )}
        >
          <textarea
            aria-label="Message Alma"
            data-no-drag="true"
            disabled={disabled}
            maxLength={2000}
            rows={1}
            value={value}
            placeholder="Ask Alma anything…"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className={cn(
              "max-h-32 min-h-[34px] flex-1 resize-none border-0 bg-transparent py-2 pr-1",
              "text-[13.5px] leading-6 text-foreground outline-none",
              "placeholder:text-muted-foreground/70",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
          <div className="flex items-center gap-1 pb-0.5">
            <Button
              aria-label={recording ? "Stop recording" : "Hold to talk"}
              aria-pressed={recording}
              onClick={onToggleRecord}
              size="icon"
              variant={recording ? "destructive" : "ghost"}
              className={cn(recording && "animate-[pulse-ring_1.8s_ease-out_infinite]")}
            >
              {busyState === "transcribing" || busyState === "streaming" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Mic />
              )}
            </Button>
            <Button
              aria-label="Send message"
              disabled={!value.trim() || busy}
              onClick={onSubmit}
              size="icon"
              variant="default"
            >
              <SendHorizonal />
            </Button>
          </div>
        </div>
      );
    },
    { displayName: "Composer" },
  ),
);

function HeaderShortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="flex items-center gap-0.5">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "info" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "success" && "border-success/25 bg-success/10 text-success",
        tone === "info" && "border-primary/25 bg-primary/10 text-primary",
        tone === "muted" && "border-border bg-card/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
