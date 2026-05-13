import { randomUUID } from "node:crypto";

import type {
  ChatCompletionRequest,
  ModelOption,
  SpeechPayload,
  StreamEventPayload,
} from "../shared/ipc.ts";
import { modelOptionSchema, speechPayloadSchema } from "../shared/ipc.ts";
import { sanitizeMultilineText } from "../shared/sanitize.ts";
import { extractContentDelta } from "../shared/sse.ts";

import { getLiteLLMConfig, getLiteLLMKey } from "./config";
import { logger } from "./logger";

function endpoint(path: string) {
  return `${getLiteLLMConfig().baseUrl.replace(/\/$/, "")}${path}`;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${getLiteLLMKey()}`,
    ...(extra ?? {}),
  };
}

export async function fetchModels(): Promise<ModelOption[]> {
  const response = await fetch(endpoint("/v1/models"), {
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch models (${response.status})`);
  }

  const data = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> };
  return (data.data ?? []).map((model) =>
    modelOptionSchema.parse({
      id: model.id,
      label: model.id,
      ownedBy: model.owned_by,
    }),
  );
}

export async function* streamChatCompletion(
  request: ChatCompletionRequest,
): AsyncGenerator<StreamEventPayload> {
  const response = await fetch(endpoint("/v1/chat/completions"), {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      model: request.model,
      messages: request.messages.map((message) => ({
        ...message,
        content: sanitizeMultilineText(message.content),
      })),
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || `Chat request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    const segments = buffered.split("\n\n");
    buffered = segments.pop() ?? "";

    for (const segment of segments) {
      const parsed = extractContentDelta(segment);
      if (!parsed) {
        continue;
      }

      if (parsed.done) {
        yield { messageId: request.messageId, done: true };
        return;
      }

      if (parsed.error) {
        yield { messageId: request.messageId, error: parsed.error };
        return;
      }

      if (parsed.delta) {
        logger.debug("Stream delta received", {
          messageId: request.messageId,
          length: parsed.delta.length,
        });
        yield {
          messageId: request.messageId,
          delta: parsed.delta,
        };
      }
    }
  }

  yield { messageId: request.messageId, done: true };
}

export async function transcribeAudio(buffer: Uint8Array, mimeType: string, model: string) {
  const formData = new FormData();
  const extension = mimeType.includes("webm") ? "webm" : "wav";
  formData.append(
    "file",
    new Blob([buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer], {
      type: mimeType,
    }),
    `recording.${extension}`,
  );
  formData.append("model", model);

  const response = await fetch(endpoint("/v1/audio/transcriptions"), {
    method: "POST",
    headers: headers(),
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Transcription failed (${response.status})`);
  }

  const data = (await response.json()) as { text?: string };
  return sanitizeMultilineText(data.text ?? "", 4_000);
}

export async function synthesizeSpeech(input: string, model: string): Promise<SpeechPayload> {
  const response = await fetch(endpoint("/v1/audio/speech"), {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      model,
      input: sanitizeMultilineText(input, 4_000),
      voice: "alloy",
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Speech synthesis failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? "audio/mpeg";
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return speechPayloadSchema.parse({
    audioUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
  });
}

export const createMessageId = randomUUID;
