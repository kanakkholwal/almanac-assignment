import { app } from "electron";
import { z } from "zod";

import type {
  ChatCompletionRequest,
  ModelOption,
  SpeechPayload,
  StreamEventPayload,
} from "../shared/ipc";
import { modelOptionSchema, speechPayloadSchema } from "../shared/ipc";
import { sanitizeMultilineText } from "../shared/sanitize";
import { extractContentDelta } from "../shared/sse";

import { getApiKey, getBaseUrl, getDefaults, hasApiKey } from "./config";
import { logger, serializeError } from "./logger";

const CHAT_CONNECT_TIMEOUT_MS = 20_000;
const CHAT_IDLE_TIMEOUT_MS = 30_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;
const SPEECH_TIMEOUT_MS = 30_000;
const MODELS_TIMEOUT_MS = 10_000;
const MODELS_CACHE_TTL_MS = 5 * 60_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 10_000;
const RETRY_AFTER_CAP_MS = 30_000;

const USER_AGENT = `Almanac/${app.getVersion?.() ?? "0.0.0"} (${process.platform})`;

export class LiteLLMError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retriable: boolean;
  readonly requestId?: string;

  constructor(
    message: string,
    status = 0,
    code = "UNKNOWN",
    retriable = false,
    requestId?: string,
  ) {
    super(message);
    this.name = "LiteLLMError";
    this.status = status;
    this.code = code;
    this.retriable = retriable;
    this.requestId = requestId;
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  // Numeric seconds form
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  }
  // HTTP-date form
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    if (delta > 0) return Math.min(delta, RETRY_AFTER_CAP_MS);
  }
  return null;
}

function computeBackoff(attempt: number): number {
  const exp = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  return exp + Math.floor(Math.random() * RETRY_BASE_MS);
}

function endpoint(path: string): string {
  return `${getBaseUrl()}${path}`;
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  if (!hasApiKey()) {
    throw new LiteLLMError(
      "LITELLM_API_KEY is not configured. Set it in your .env to enable assistant features.",
      0,
      "MISSING_API_KEY",
    );
  }
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "User-Agent": USER_AGENT,
    "X-Stainless-Lang": "node",
    ...(extra ?? {}),
  };
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

interface ApiErrorDetail {
  message: string;
  code: string;
}

async function readErrorDetail(response: Response): Promise<ApiErrorDetail> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as
        | { error?: { message?: string; code?: string; type?: string } }
        | { message?: string; code?: string }
        | string;
      if (typeof body === "string") {
        return { message: body.slice(0, 800), code: "HTTP_ERROR" };
      }
      const err = (body as { error?: { message?: string; code?: string; type?: string } }).error;
      if (err?.message) {
        return { message: err.message, code: err.code ?? err.type ?? "HTTP_ERROR" };
      }
      const flat = body as { message?: string; code?: string };
      if (flat.message) {
        return { message: flat.message, code: flat.code ?? "HTTP_ERROR" };
      }
      return { message: JSON.stringify(body).slice(0, 500), code: "HTTP_ERROR" };
    }
    const text = (await response.text()).slice(0, 500);
    return { message: text, code: "HTTP_ERROR" };
  } catch {
    return { message: `${response.status} ${response.statusText}`, code: "HTTP_ERROR" };
  }
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, init: FetchOptions): Promise<Response> {
  const {
    timeoutMs = 30_000,
    retries = 0,
    signal: userSignal,
    ...rest
  } = init;

  let attempt = 0;
  let lastError: unknown;
  let nextDelayMs = 0;

  while (attempt <= retries) {
    if (nextDelayMs > 0) await sleep(nextDelayMs);
    nextDelayMs = 0;

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException("timeout", "AbortError")),
      timeoutMs,
    );

    const onUserAbort = () => controller.abort(userSignal?.reason);
    if (userSignal) {
      if (userSignal.aborted) {
        clearTimeout(timer);
        throw new LiteLLMError("Request cancelled", 0, "CANCELLED", false);
      }
      userSignal.addEventListener("abort", onUserAbort, { once: true });
    }

    try {
      const response = await fetch(url, { ...rest, signal: controller.signal });
      if (response.ok) return response;

      const requestId = response.headers.get("x-request-id") ?? undefined;
      const retriable = isRetriableStatus(response.status);

      if (!retriable || attempt === retries) {
        const detail = await readErrorDetail(response);
        throw new LiteLLMError(
          detail.message || `Request failed (${response.status} ${response.statusText})`,
          response.status,
          detail.code,
          retriable,
          requestId,
        );
      }

      // Drain the body so the connection can be reused, then schedule the retry
      // honoring Retry-After when the server hinted one.
      void response.body?.cancel().catch(() => undefined);
      const hinted = parseRetryAfter(response.headers.get("retry-after"));
      nextDelayMs = hinted ?? computeBackoff(attempt);
      lastError = new LiteLLMError(
        `Transient ${response.status} from upstream`,
        response.status,
        "TRANSIENT",
        true,
        requestId,
      );
    } catch (error) {
      lastError = error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (userSignal?.aborted) {
          throw new LiteLLMError("Request cancelled", 0, "CANCELLED", false);
        }
        if (attempt === retries) {
          throw new LiteLLMError("Request timed out", 408, "TIMEOUT", true);
        }
        nextDelayMs = computeBackoff(attempt);
      } else if (error instanceof LiteLLMError) {
        if (!error.retriable || attempt === retries) throw error;
        nextDelayMs = computeBackoff(attempt);
      } else if (attempt === retries) {
        throw new LiteLLMError(
          error instanceof Error ? error.message : "Network error",
          0,
          "NETWORK",
          true,
        );
      } else {
        nextDelayMs = computeBackoff(attempt);
      }
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    }

    attempt += 1;
  }

  throw lastError instanceof Error ? lastError : new LiteLLMError("Request failed", 0, "UNKNOWN");
}

let modelsCache: ModelOption[] | null = null;
let modelsCacheAt = 0;
let modelsInflight: Promise<ModelOption[]> | null = null;

const modelsResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        owned_by: z.string().optional(),
      }),
    )
    .optional(),
});

export async function fetchModels(force = false): Promise<ModelOption[]> {
  if (!hasApiKey()) return [];
  if (!force && modelsCache && Date.now() - modelsCacheAt < MODELS_CACHE_TTL_MS) {
    return modelsCache;
  }
  if (modelsInflight) return modelsInflight;

  modelsInflight = (async () => {
    try {
      const response = await requestWithRetry(endpoint("/v1/models"), {
        method: "GET",
        headers: buildHeaders(),
        timeoutMs: MODELS_TIMEOUT_MS,
        retries: 2,
      });
      const data = modelsResponseSchema.parse(await response.json());
      const models = (data.data ?? [])
        .map((model) =>
          modelOptionSchema.safeParse({
            id: model.id,
            label: model.id,
            ownedBy: model.owned_by,
          }),
        )
        .flatMap((result) => (result.success ? [result.data] : []));
      modelsCache = models;
      modelsCacheAt = Date.now();
      return models;
    } finally {
      modelsInflight = null;
    }
  })();

  return modelsInflight;
}

const activeStreams = new Map<string, AbortController>();

export interface StreamRunOptions {
  onEvent: (event: StreamEventPayload) => void;
  signal?: AbortSignal;
}

export async function streamChatCompletion(
  request: ChatCompletionRequest,
  { onEvent, signal }: StreamRunOptions,
): Promise<void> {
  cancelStream(request.messageId);

  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  activeStreams.set(request.messageId, controller);

  const sanitizedMessages = request.messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? sanitizeMultilineText(message.content, 20_000)
        : message.content.map((part) =>
            part.type === "text"
              ? { type: "text" as const, text: sanitizeMultilineText(part.text, 20_000) }
              : part,
          ),
  }));

  const body = {
    model: request.model || getDefaults().chat,
    messages: sanitizedMessages,
    stream: true,
    ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
    ...(typeof request.maxTokens === "number" ? { max_tokens: request.maxTokens } : {}),
  };

  let idleTimer: NodeJS.Timeout | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => controller.abort(new DOMException("idle-timeout", "AbortError")),
      CHAT_IDLE_TIMEOUT_MS,
    );
  };

  try {
    resetIdleTimer();

    // Use requestWithRetry for the connection phase so we recover from transient
    // upstream blips before any tokens have streamed. Once data starts flowing
    // we cannot safely retry (a partial response is not idempotent).
    const response = await requestWithRetry(endpoint("/v1/chat/completions"), {
      method: "POST",
      headers: buildHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
      body: JSON.stringify(body),
      timeoutMs: CHAT_CONNECT_TIMEOUT_MS,
      retries: 2,
      signal: controller.signal,
    });

    if (!response.body) {
      throw new LiteLLMError("Streaming response has no body", 500, "NO_BODY");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffered = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();
      buffered += decoder.decode(value, { stream: true });

      const segments = buffered.split("\n\n");
      buffered = segments.pop() ?? "";

      for (const segment of segments) {
        const parsed = extractContentDelta(segment);
        if (!parsed) continue;

        if (parsed.error) {
          onEvent({ messageId: request.messageId, error: parsed.error });
          return;
        }

        if (parsed.delta) {
          onEvent({ messageId: request.messageId, delta: parsed.delta });
        }

        if (parsed.done) {
          onEvent({ messageId: request.messageId, done: true });
          return;
        }
      }
    }

    onEvent({ messageId: request.messageId, done: true });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const reason = (controller.signal.reason as Error | undefined)?.message ?? "cancelled";
      logger.info("Chat stream aborted", { messageId: request.messageId, reason });
      onEvent({
        messageId: request.messageId,
        error: reason === "idle-timeout" ? "The model stopped responding." : "Cancelled",
      });
      return;
    }

    logger.error("Chat stream failed", serializeError(error));
    onEvent({
      messageId: request.messageId,
      error: error instanceof Error ? error.message : "Chat request failed",
    });
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    activeStreams.delete(request.messageId);
  }
}

export function cancelStream(messageId: string): boolean {
  const controller = activeStreams.get(messageId);
  if (!controller) return false;
  controller.abort(new DOMException("cancelled", "AbortError"));
  activeStreams.delete(messageId);
  return true;
}

export function cancelAllStreams(): void {
  for (const [, controller] of activeStreams) {
    controller.abort(new DOMException("cancelled", "AbortError"));
  }
  activeStreams.clear();
}

function pickAudioExtension(mimeType: string | undefined): string {
  if (!mimeType) return "webm";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

const transcriptionResponseSchema = z.object({
  text: z.string().optional().default(""),
});

export async function transcribeAudio(
  audio: ArrayBuffer | Uint8Array,
  mimeType: string,
  model: string,
): Promise<string> {
  const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  if (bytes.byteLength === 0) {
    throw new LiteLLMError("Audio payload is empty", 400, "EMPTY_AUDIO");
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new LiteLLMError(
      `Audio file exceeds the ${MAX_AUDIO_BYTES / (1024 * 1024)}MB limit`,
      413,
      "PAYLOAD_TOO_LARGE",
    );
  }

  const extension = pickAudioExtension(mimeType);
  const blob = new Blob([bytes.slice().buffer], { type: mimeType || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, `recording.${extension}`);
  form.append("model", model || getDefaults().transcribe);
  form.append("response_format", "json");

  const response = await requestWithRetry(endpoint("/v1/audio/transcriptions"), {
    method: "POST",
    headers: buildHeaders(),
    body: form,
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    retries: 1,
  });

  const data = transcriptionResponseSchema.parse(await response.json());
  return sanitizeMultilineText(data.text, 8_000);
}

export interface SpeechOptions {
  voice?: string;
  format?: "mp3" | "opus" | "aac" | "flac" | "wav";
}

export async function synthesizeSpeech(
  input: string,
  model: string,
  options: SpeechOptions = {},
): Promise<SpeechPayload> {
  const text = sanitizeMultilineText(input, 4_000).trim();
  if (!text) {
    throw new LiteLLMError("Speech input is empty", 400, "EMPTY_INPUT");
  }

  const voice = options.voice || getDefaults().voice;
  const format = options.format || "mp3";

  const response = await requestWithRetry(endpoint("/v1/audio/speech"), {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      model: model || getDefaults().speech,
      input: text,
      voice,
      response_format: format,
    }),
    timeoutMs: SPEECH_TIMEOUT_MS,
    retries: 1,
  });

  const buffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? `audio/${format === "mp3" ? "mpeg" : format}`;
  const base64 = Buffer.from(buffer).toString("base64");

  return speechPayloadSchema.parse({
    audioUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
  });
}
