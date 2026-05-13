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
  Headphones,
  LoaderCircle,
  Maximize2,
  Mic,
  Minus,
  MonitorUp,
  SendHorizonal,
  Settings,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import {
  getInitialNotification,
  matchMeetingWorkflow,
  startNotesTimeline,
  type MeetingNotification,
} from "@/lib/mockMeetingAdapter";
import { createId, formatClock, normalizePrompt } from "@/lib/utils";

const CompactLauncher = lazy(async () =>
  import("@/features/assistant/CompactLauncher").then((module) => ({
    default: module.CompactLauncher,
  })),
);
const Transcript = lazy(async () =>
  import("@/features/assistant/Transcript").then((module) => ({
    default: module.Transcript,
  })),
);
const MeetingPrompt = lazy(async () =>
  import("@/features/meeting/MeetingPrompt").then((module) => ({
    default: module.MeetingPrompt,
  })),
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
  if (typeof window === "undefined") {
    return SEEDED_TIMELINE;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return SEEDED_TIMELINE;
  }
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
    <div className="flex items-center justify-center py-6 text-sm text-surface-muted">
      <LoaderCircle className="mr-2 animate-spin" size={14} />
      Loading…
    </div>
  );
});

const ShortcutChip = memo(function ShortcutChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-white/15 bg-white/8 px-1.5 text-[11px] font-medium text-surface-ink/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      {label}
    </span>
  );
});

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
          setError(fetchError instanceof Error ? fetchError.message : "Startup initialization failed");
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

      if (event.type === "runtime-warning") {
        setRuntimeWarning(event.message);
      }

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
        .map((item) => ({
          role: item.message.role,
          content: item.message.content,
        })),
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
      if (transcript.trim()) {
        await sendMessage(transcript);
      }
    } catch (transcriptionError) {
      setCaptureState("idle");
      setError(
        transcriptionError instanceof Error ? transcriptionError.message : "Transcription failed",
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
  const modKey = isMac ? "⌘" : "⌃";
  const platformLabel = isMac ? "macOS" : runtimeInfo?.platform === "linux" ? "Linux" : "Windows";

  if (windowMode === "compact") {
    return (
      <div className="h-screen w-screen bg-transparent p-0.5">
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
    <div className="h-screen w-screen bg-[#160d1d] p-3">
      <motion.div
        layoutId="alma-shell"
        className="app-shell relative flex h-full w-full flex-col overflow-hidden rounded-[2rem]"
      >
        <Suspense fallback={null}>
          <MeetingPrompt
            onDismiss={() => setNotification(null)}
            onStart={startNotes}
            prompt={notification}
          />
        </Suspense>

        <header
          className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"
          data-drag-region="true"
        >
          <div className="flex items-center gap-2" data-no-drag="true">
            <WindowControls runtime={runtimeInfo} windowState={windowState} />
            <button
              className="ml-1 text-[14px] font-medium text-surface-ink"
              onClick={() => setWindowMode("compact")}
            >
              Ask Alma
            </button>
            <ShortcutChip label={modKey} />
            <ShortcutChip label="—" />
          </div>

          <div className="flex items-center gap-2" data-no-drag="true">
            <button
              className="text-[14px] font-medium text-surface-ink"
              onClick={() => setNotification(getInitialNotification())}
            >
              Capture
            </button>
            <ShortcutChip label={modKey} />
            <ShortcutChip label="S" />
          </div>

          <div className="flex items-center gap-1.5" data-no-drag="true">
            <Button
              aria-label="Toggle voice output"
              aria-pressed={speechEnabled}
              onClick={() => setSpeechEnabled((current) => !current)}
              size="icon"
              variant={speechEnabled ? "accent" : "glass"}
            >
              <Headphones size={14} />
            </Button>
            <Button
              aria-label="Capture screen"
              onClick={() => setNotification(getInitialNotification())}
              size="icon"
              variant="glass"
            >
              <MonitorUp size={14} />
            </Button>
            <Button
              aria-label="Settings"
              aria-pressed={alwaysOnTop}
              onClick={() => {
                const next = !alwaysOnTop;
                setAlwaysOnTop(next);
                void window.almanac?.setAlwaysOnTop(next);
              }}
              size="icon"
              variant="glass"
            >
              <Settings size={14} />
            </Button>
            <Button
              aria-label="Minimize"
              onClick={() => setWindowMode("compact")}
              size="icon"
              variant="glass"
            >
              <Minus size={14} />
            </Button>
            <Button
              aria-label={windowState?.isMaximized ? "Restore" : "Maximize"}
              onClick={() => void window.almanac?.toggleMaximizeWindow()}
              size="icon"
              variant="glass"
            >
              <Maximize2 size={13} />
            </Button>
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden bg-alma-blur">
          <div className="pointer-events-none absolute inset-0 bg-alma-chat opacity-100" />

          <div className="relative z-10 flex h-full flex-col px-5 pb-4">
            <div className="flex items-center justify-center gap-3 py-4 text-center text-[13px] text-surface-ink/85">
              <span>Today, {currentTime}</span>
              {captureState === "listening" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                  Alma listening…
                </span>
              ) : null}
              {windowState?.isMaximized ? (
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-surface-muted">
                  Maximized
                </span>
              ) : null}
            </div>

            <ScrollArea className="scroll-shadow min-h-0 flex-1" viewportRef={viewportRef}>
              <div className="pb-6 pr-1">
                <Suspense fallback={<LazyFallback />}>
                  <Transcript items={deferredTimeline} />
                </Suspense>
              </div>
            </ScrollArea>

            <AnimatePresence>
              {runtimeWarning ? (
                <motion.div
                  key="warn"
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-2 rounded-2xl border border-amber-200/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100"
                  exit={{ opacity: 0, y: 8 }}
                  initial={{ opacity: 0, y: 8 }}
                >
                  {runtimeWarning}
                </motion.div>
              ) : null}
              {updateStatus ? (
                <motion.div
                  key="upd"
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-2 rounded-2xl border border-white/12 bg-white/8 px-4 py-2 text-xs text-surface-muted"
                  exit={{ opacity: 0, y: 8 }}
                  initial={{ opacity: 0, y: 8 }}
                >
                  {updateStatus}
                </motion.div>
              ) : null}
              {error ? (
                <motion.div
                  key="err"
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-rose-200/20 bg-rose-400/10 px-4 py-2 text-xs text-rose-100"
                  exit={{ opacity: 0, y: 8 }}
                  initial={{ opacity: 0, y: 8 }}
                >
                  <span className="truncate">{error}</span>
                  <button
                    className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide hover:bg-white/10"
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="message-surface mt-1 flex items-center gap-2 rounded-[1.4rem] px-3 py-2.5">
              <input
                aria-label="Message Alma"
                className="w-full border-0 bg-transparent px-2 text-[14px] text-surface-ink outline-none placeholder:text-surface-muted/80"
                data-no-drag="true"
                disabled={captureState === "streaming" || captureState === "transcribing"}
                maxLength={2000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder="Type your message..."
                value={input}
              />

              <Button
                aria-label={recorder.isRecording ? "Stop recording" : "Hold to talk"}
                className={recorder.isRecording ? "animate-pulseRing" : ""}
                onClick={() => void toggleRecording()}
                size="icon"
                variant={recorder.isRecording ? "accent" : "glass"}
              >
                {captureState === "transcribing" || captureState === "streaming" ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : (
                  <Mic size={15} />
                )}
              </Button>
              <Button
                aria-label="Send message"
                disabled={!input.trim() || captureState === "streaming"}
                onClick={() => void sendMessage(input)}
                size="icon"
                variant="accent"
              >
                <SendHorizonal size={15} />
              </Button>
            </div>

            {runtimeInfo ? (
              <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-[0.15em] text-surface-muted/70">
                <span>{platformLabel}</span>
                <span>·</span>
                <span>v{runtimeInfo.appVersion}</span>
                <span>·</span>
                <span>{runtimeInfo.config.apiKeyPresent ? "API ready" : "No API key"}</span>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export { ShortcutChip };
