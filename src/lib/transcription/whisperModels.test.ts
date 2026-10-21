import { describe, expect, it } from "vitest";
import {
  downloadPercent,
  downloadStatusText,
  formatBytes,
} from "@/lib/transcription/whisperModels";

describe("formatBytes", () => {
  it("renders megabytes for model-sized files", () => {
    expect(formatBytes(147_964_211)).toBe("148 MB");
    expect(formatBytes(487_614_201)).toBe("488 MB");
  });

  it("keeps a decimal for small sizes", () => {
    expect(formatBytes(5_400_000)).toBe("5.4 MB");
  });

  it("switches to gigabytes past a thousand megabytes", () => {
    expect(formatBytes(1_533_774_781)).toBe("1.53 GB");
  });

  it("handles zero and nonsense without producing NaN", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(-5)).toBe("0 MB");
    expect(formatBytes(Number.NaN)).toBe("0 MB");
  });
});

describe("downloadPercent", () => {
  it("reports progress through the download", () => {
    expect(downloadPercent(0, 200)).toBe(0);
    expect(downloadPercent(100, 200)).toBe(50);
    expect(downloadPercent(200, 200)).toBe(100);
  });

  it("never runs past the end of the track", () => {
    expect(downloadPercent(500, 200)).toBe(100);
    expect(downloadPercent(-10, 200)).toBe(0);
  });

  it("returns zero when the total is unknown", () => {
    expect(downloadPercent(50, 0)).toBe(0);
    expect(downloadPercent(50, Number.NaN)).toBe(0);
  });
});

describe("downloadStatusText", () => {
  it("says nothing when no download is running", () => {
    expect(downloadStatusText(null)).toBeNull();
  });

  it("combines percent with the byte counts", () => {
    const text = downloadStatusText({ modelId: "base.en", received: 74_000_000, total: 148_000_000 });
    expect(text).toBe("50% — 74 MB of 148 MB");
  });
});
