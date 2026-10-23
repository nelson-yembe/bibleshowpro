/** What a connected display is for during the service. */
export type ScreenRole = "projector" | "side" | "stage";

/** Display id → role; displays without one are not used. */
export type ScreenRoles = Record<string, ScreenRole>;

export const SCREEN_ROLE_LABELS: Record<ScreenRole | "none", string> = {
  projector: "Main projector",
  side: "Copy of the projector",
  stage: "Stage display",
  none: "Not used",
};

/** Give a display a role. The projector and the stage display each fill one screen, so
 *  taking either role moves it off whichever display had it. */
export function assignRole(roles: ScreenRoles, displayId: string, role: ScreenRole | null): ScreenRoles {
  const next: ScreenRoles = {};
  for (const [id, current] of Object.entries(roles)) {
    if (id === displayId) continue;
    if (role !== "side" && role !== null && current === role) continue;
    next[id] = current;
  }
  if (role) next[displayId] = role;
  return next;
}

export function displayWithRole(roles: ScreenRoles, role: "projector" | "stage"): string | null {
  return Object.keys(roles).find((id) => roles[id] === role) ?? null;
}

/** Side screens on displays that are connected now. */
export function connectedSideScreens(roles: ScreenRoles, connected: string[]): string[] {
  return connected.filter((id) => roles[id] === "side");
}
