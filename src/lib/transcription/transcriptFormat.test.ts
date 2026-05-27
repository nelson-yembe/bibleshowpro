import { describe, expect, it } from "vitest";
import { formatTranscriptProse } from "@/lib/transcription/transcriptFormat";

describe("formatTranscriptProse", () => {
  it("joins phrases into readable sentences", () => {
    const prose = formatTranscriptProse([
      { text: "good morning church", offsetMs: 0 },
      { text: "today we look at john three sixteen", offsetMs: 900 },
      { text: "let us pray", offsetMs: 5000 },
    ]);
    expect(prose).toContain("Good morning church");
    expect(prose).toContain("today we look at john three sixteen");
    expect(prose).toMatch(/pray\.?$/);
  });

  it("starts a new paragraph after long pauses", () => {
    const prose = formatTranscriptProse([
      { text: "first point", offsetMs: 0 },
      { text: "second point", offsetMs: 6000 },
    ]);
    expect(prose).toContain("\n\n");
  });
});
