import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CaptionOverlay } from "@/components/presentation/CaptionOverlay";
import { CAPTION_STALE_MS, DEFAULT_CAPTION_SETTINGS } from "@/lib/captions";
import { useCaptionStore, type CaptionSnapshot } from "@/stores/captionStore";

function seed(overrides: Partial<CaptionSnapshot> = {}) {
  useCaptionStore.setState({
    settings: { ...DEFAULT_CAPTION_SETTINGS, enabled: true },
    finalLines: [],
    partial: "",
    revision: 0,
    ...overrides,
  });
}

describe("CaptionOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("draws nothing while captions are disabled", () => {
    seed({
      settings: { ...DEFAULT_CAPTION_SETTINGS, enabled: false },
      finalLines: ["hello"],
      revision: 1,
    });
    const { container } = render(<CaptionOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing before any caption has arrived", () => {
    seed({ revision: 0 });
    const { container } = render(<CaptionOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders finalized lines and the in-flight partial", () => {
    seed({ finalLines: ["blessed are the pure"], partial: "in heart", revision: 1 });
    render(<CaptionOverlay />);
    expect(screen.getByText("blessed are the pure")).toBeInTheDocument();
    expect(screen.getByText("in heart")).toBeInTheDocument();
  });

  it("honours the line budget, keeping the newest", () => {
    seed({
      settings: { ...DEFAULT_CAPTION_SETTINGS, enabled: true, maxLines: 1 },
      finalLines: ["older line"],
      partial: "newer line",
      revision: 1,
    });
    render(<CaptionOverlay />);
    expect(screen.queryByText("older line")).not.toBeInTheDocument();
    expect(screen.getByText("newer line")).toBeInTheDocument();
  });

  it("blanks itself once the engine goes quiet", () => {
    seed({ finalLines: ["still here"], revision: 1 });
    const { container } = render(<CaptionOverlay />);
    expect(screen.getByText("still here")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(CAPTION_STALE_MS);
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("comes back when a new caption arrives after going quiet", () => {
    seed({ finalLines: ["first"], revision: 1 });
    render(<CaptionOverlay />);

    act(() => {
      vi.advanceTimersByTime(CAPTION_STALE_MS);
    });
    expect(screen.queryByText("first")).not.toBeInTheDocument();

    act(() => {
      useCaptionStore.setState({ finalLines: ["second"], revision: 2 });
    });
    expect(screen.getByText("second")).toBeInTheDocument();
  });
});
