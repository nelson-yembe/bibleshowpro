import { describe, expect, it } from "vitest";
import { assignRole, connectedSideScreens, displayWithRole } from "@/lib/screenRoles";

describe("assignRole", () => {
  it("keeps one projector: taking the role moves it", () => {
    const roles = assignRole({ a: "projector", b: "side" }, "b", "projector");
    expect(roles).toEqual({ b: "projector" });
  });

  it("keeps one stage display", () => {
    expect(assignRole({ a: "stage" }, "c", "stage")).toEqual({ c: "stage" });
  });

  it("allows any number of copies", () => {
    expect(assignRole({ a: "side", b: "projector" }, "c", "side")).toEqual({ a: "side", b: "projector", c: "side" });
  });

  it("clears a display's role", () => {
    expect(assignRole({ a: "side", b: "projector" }, "a", null)).toEqual({ b: "projector" });
  });
});

it("finds the displays for each role", () => {
  const roles = { a: "projector", b: "side", c: "side", d: "stage" } as const;
  expect(displayWithRole(roles, "projector")).toBe("a");
  expect(displayWithRole({}, "stage")).toBeNull();
  expect(connectedSideScreens(roles, ["a", "c", "e"])).toEqual(["c"]);
});
