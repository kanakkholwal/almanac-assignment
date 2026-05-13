import type { StreamEventPayload } from "./ipc";

export function extractContentDelta(raw: string): StreamEventPayload | null {
  const trimmed = raw.trim();

  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const payload = trimmed.replace(/^data:\s*/, "");
  if (payload === "[DONE]") {
    return { messageId: "", done: true };
  }

  try {
    const parsed = JSON.parse(payload) as {
      id?: string;
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
      error?: { message?: string };
    };

    if (parsed.error?.message) {
      return { messageId: parsed.id ?? "", error: parsed.error.message };
    }

    const delta =
      parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;

    return {
      messageId: parsed.id ?? "",
      delta,
      done: false,
    };
  } catch {
    return null;
  }
}
