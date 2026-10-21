import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TickerOverlay } from "@/components/presentation/TickerOverlay";
import { DEFAULT_TICKER_SETTINGS, type TickerSettings } from "@/lib/ticker";
import { useTickerStore } from "@/stores/tickerStore";

function seed(settings: Partial<TickerSettings>) {
  useTickerStore.setState({
    settings: { ...DEFAULT_TICKER_SETTINGS, ...settings },
    revision: 1,
  });
}

describe("TickerOverlay", () => {
  beforeEach(() => {
    useTickerStore.setState({ settings: { ...DEFAULT_TICKER_SETTINGS }, revision: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("draws nothing while disabled", () => {
    seed({ enabled: false, text: "Welcome to church" });
    const { container } = render(<TickerOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when enabled with a blank message", () => {
    seed({ enabled: true, text: "   " });
    const { container } = render(<TickerOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the message with whitespace collapsed", () => {
    seed({ enabled: true, text: "  Youth   meeting  at  6  " });
    render(<TickerOverlay />);
    expect(screen.getByText("Youth meeting at 6")).toBeInTheDocument();
  });

  it("sits on the chosen edge", () => {
    seed({ enabled: true, text: "Welcome", position: "top" });
    const { container } = render(<TickerOverlay />);
    expect((container.firstChild as HTMLElement).className).toContain("top-0");

    cleanup();
    seed({ enabled: true, text: "Welcome", position: "bottom" });
    const second = render(<TickerOverlay />);
    expect((second.container.firstChild as HTMLElement).className).toContain("bottom-0");
  });

  it("scrolls a long message for longer than a short one at the same speed", () => {
    seed({ enabled: true, text: "short", speed: 1 });
    const first = render(<TickerOverlay />);
    const shortDuration = (first.getByText("short") as HTMLElement).style.animationDuration;

    cleanup();
    seed({ enabled: true, text: "w".repeat(600), speed: 1 });
    const second = render(<TickerOverlay />);
    const longDuration = (second.getByText("w".repeat(600)) as HTMLElement).style.animationDuration;

    expect(Number.parseFloat(longDuration)).toBeGreaterThan(Number.parseFloat(shortDuration));
  });
});
