import { describe, expect, it } from "vitest";

import { sanitizeMultilineText, sanitizeUserText } from "../shared/sanitize";

describe("sanitize helpers", () => {
  it("strips control characters and angle brackets from user prompts", () => {
    expect(sanitizeUserText("  hi<alma>\n\tthere\u0000  ")).toBe("hialma there");
  });

  it("strips dangerous brackets from multiline content", () => {
    expect(sanitizeMultilineText("line 1\n<unsafe>")).toBe("line 1 unsafe");
  });
});
