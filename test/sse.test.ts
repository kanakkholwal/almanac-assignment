import { describe, expect, it } from "vitest";

import { extractContentDelta } from "../shared/sse";

describe("extractContentDelta", () => {
  it("reads delta chunks from LiteLLM/OpenAI style SSE payloads", () => {
    const result = extractContentDelta(
      'data: {"id":"msg_123","choices":[{"delta":{"content":"hello"}}]}',
    );

    expect(result).toEqual({
      messageId: "msg_123",
      delta: "hello",
      done: false,
    });
  });

  it("marks done when the stream closes", () => {
    const result = extractContentDelta("data: [DONE]");

    expect(result).toEqual({
      messageId: "",
      done: true,
    });
  });
});
