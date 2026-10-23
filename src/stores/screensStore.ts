import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import { assignRole, connectedSideScreens, displayWithRole, type ScreenRole, type ScreenRoles } from "@/lib/screenRoles";
import { useStageStore } from "@/stores/stageStore";

const ROLES_KEY = "bsp-screen-roles";

function readRoles(): ScreenRoles {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROLES_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ScreenRoles) : {};
  } catch {
    return {};
  }
}

function saveRoles(roles: ScreenRoles) {
  try {
    localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  } catch {
    // Remembering the screens is a convenience.
  }
}

interface ScreensState {
  roles: ScreenRoles;
  /** Displays showing a side screen right now. */
  openSide: string[];
  error: string | null;
  init: () => Promise<void>;
  setRole: (displayId: string, role: ScreenRole | null) => Promise<void>;
  /** Open a copy of the projector on every connected side screen. */
  openSideScreens: () => Promise<void>;
  closeSideScreens: () => Promise<void>;
  refresh: () => Promise<void>;
}

let listening = false;

/** Before screens had roles, the stage display remembered its own screen. */
function withEarlierStageScreen(roles: ScreenRoles): ScreenRoles {
  const stage = useStageStore.getState().displayId;
  return stage && !displayWithRole(roles, "stage") ? assignRole(roles, stage, "stage") : roles;
}

export const useScreensStore = create<ScreensState>((set, get) => ({
  roles: withEarlierStageScreen(readRoles()),
  openSide: [],
  error: null,

  init: async () => {
    if (!listening) {
      listening = true;
      void listen("screens-changed", () => void get().refresh()).catch(() => {});
    }
    try {
      // The backend forgets the projector's screen when the app restarts.
      await api.setProjectorDisplay(displayWithRole(get().roles, "projector"));
    } catch {
      // Browser dev server: no displays to place.
    }
    await get().refresh();
  },

  setRole: async (displayId, role) => {
    const before = get().roles;
    const roles = assignRole(before, displayId, role);
    saveRoles(roles);
    set({ roles, error: null });
    useStageStore.getState().setDisplayId(displayWithRole(roles, "stage") ?? "");
    try {
      const projector = displayWithRole(roles, "projector");
      if (projector !== displayWithRole(before, "projector")) await api.setProjectorDisplay(projector);
      // A screen that stopped being a copy closes now; a new copy opens once the projector does.
      for (const id of get().openSide) {
        if (roles[id] !== "side") await api.closeSideScreen(id);
      }
      if (role === "side" && (await api.getOutputStatus()).open) await api.openSideScreen(displayId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
    await get().refresh();
  },

  openSideScreens: async () => {
    try {
      const connected = (await api.listDisplays()).map((d) => d.id);
      for (const id of connectedSideScreens(get().roles, connected)) await api.openSideScreen(id);
      set({ error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
    await get().refresh();
  },

  closeSideScreens: async () => {
    try {
      for (const id of get().openSide) await api.closeSideScreen(id);
    } catch {
      // A window already gone is closed enough.
    }
    await get().refresh();
  },

  refresh: async () => {
    try {
      set({ openSide: await api.listSideScreens() });
    } catch {
      set({ openSide: [] });
    }
  },
}));
