import { describe, expect, it } from "vitest";

import { matchMeetingWorkflow, startNotesTimeline } from "../src/lib/mockMeetingAdapter";

describe("mockMeetingAdapter", () => {
  it("returns seeded scheduling content for ideation requests", () => {
    const result = matchMeetingWorkflow(
      "and setup a ideation call on thursday with the product & design team",
    );

    expect(result).not.toBeNull();
    expect(result?.some((item) => item.kind === "thread")).toBe(true);
    expect(result?.some((item) => item.kind === "suggestion")).toBe(true);
  });

  it("returns a note-taking sequence for meeting capture", () => {
    const result = startNotesTimeline();

    expect(result[0]).toMatchObject({
      kind: "status",
      text: "Alma is taking notes...",
    });
    expect(result.some((item) => item.kind === "suggestion")).toBe(true);
  });
});
