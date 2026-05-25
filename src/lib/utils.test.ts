import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/utils";

describe("contrastRatio", () => {
  it("returns high ratio for readable pair", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeGreaterThan(10);
  });

  it("returns lower ratio for similar colors", () => {
    expect(contrastRatio("#cccccc", "#dddddd")).toBeLessThan(2);
  });
});
