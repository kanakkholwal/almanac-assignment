import { describe, expect, it } from "vitest";

import {
  appEventSchema,
  chatCompletionRequestSchema,
  windowModeSchema,
} from "../shared/ipc";

describe("ipc schemas", () => {
  it("accepts valid chat completion payloads", () => {
    expect(
      chatCompletionRequestSchema.parse({
        messageId: "msg-1",
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).toMatchObject({
      model: "gpt-4o-mini",
    });
  });

  it("rejects invalid window modes", () => {
    expect(() => windowModeSchema.parse("fullscreen")).toThrow();
  });

  it("validates update status app events", () => {
    expect(
      appEventSchema.parse({
        type: "update-status",
        status: "checking",
      }),
    ).toMatchObject({
      type: "update-status",
    });
  });
});
