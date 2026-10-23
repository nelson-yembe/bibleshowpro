import { describe, expect, it } from "vitest";
import { remoteAction } from "@/lib/liveActions";

describe("remoteAction", () => {
  it("maps the remote's buttons to live actions", () => {
    expect(remoteAction("next")).toEqual({ type: "next" });
    expect(remoteAction("go-live")).toEqual({ type: "go-live" });
    expect(remoteAction("accept-next")).toEqual({ type: "accept-next" });
  });

  it("refuses anything else, including the operator-only shortcut sheet", () => {
    expect(remoteAction("help")).toBeNull();
    expect(remoteAction("toString")).toBeNull();
  });
});
