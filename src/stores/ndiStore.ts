import { create } from "zustand";
import { api } from "@/lib/tauri";
import {
  defaultNdiConfig,
  type NdiDiscoveredSource,
  type NdiOutputConfig,
  type NdiRuntimeStatus,
} from "@/lib/ndiConfig";

interface NdiState {
  config: NdiOutputConfig;
  status: NdiRuntimeStatus | null;
  discovered: NdiDiscoveredSource[];
  loading: boolean;
  discovering: boolean;
  saving: boolean;
  error: string | null;
  pollTimer?: number;
  loadConfig: () => Promise<void>;
  saveConfig: (patch: Partial<NdiOutputConfig>) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  discoverSources: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  maybeAutoStartOnGoLive: () => Promise<void>;
}

const defaultStatus: NdiRuntimeStatus = {
  running: false,
  program: {
    active: false,
    sourceName: "",
    connections: 0,
    framesSent: 0,
    videoFrames: 0,
    audioFrames: 0,
    bitrate: 0,
    measuredFps: 0,
    tallyProgram: false,
    tallyPreview: false,
    width: 1920,
    height: 1080,
  },
  preview: {
    active: false,
    sourceName: "",
    connections: 0,
    framesSent: 0,
    videoFrames: 0,
    audioFrames: 0,
    bitrate: 0,
    measuredFps: 0,
    tallyProgram: false,
    tallyPreview: false,
    width: 1920,
    height: 1080,
  },
  captureMode: "output_window",
  uptimeMs: 0,
};

export const useNdiStore = create<NdiState>((set, get) => ({
  config: defaultNdiConfig(),
  status: null,
  discovered: [],
  loading: false,
  discovering: false,
  saving: false,
  error: null,

  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await api.getNdiConfig();
      const status = await api.getNdiStatus();
      set({ config, status });
      if (config.autoStartOnLaunch && !status.running) {
        await get().start();
      } else if (status.running) {
        get().startPolling();
      }
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ loading: false });
    }
  },

  saveConfig: async (patch) => {
    const next = { ...get().config, ...patch };
    set({ saving: true, config: next, error: null });
    try {
      const saved = await api.saveNdiConfig(next);
      set({ config: saved });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ saving: false });
    }
  },

  start: async () => {
    set({ error: null });
    try {
      const saved = await api.saveNdiConfig({ ...get().config, enabled: true });
      const status = await api.startNdiOutput();
      set({ config: saved, status });
      get().startPolling();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  stop: async () => {
    set({ error: null });
    try {
      const status = await api.stopNdiOutput();
      const saved = await api.saveNdiConfig({ ...get().config, enabled: false });
      set({ config: saved, status });
      get().stopPolling();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  refreshStatus: async () => {
    try {
      const status = await api.getNdiStatus();
      set({ status });
    } catch {
      // ignore polling errors
    }
  },

  discoverSources: async () => {
    set({ discovering: true, error: null });
    try {
      const discovered = await api.discoverNdiSources(3000);
      set({ discovered });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ discovering: false });
    }
  },

  startPolling: () => {
    get().stopPolling();
    const pollTimer = window.setInterval(() => {
      void get().refreshStatus();
    }, 1500);
    set({ pollTimer });
  },

  stopPolling: () => {
    const timer = get().pollTimer;
    if (timer) window.clearInterval(timer);
    set({ pollTimer: undefined });
  },

  maybeAutoStartOnGoLive: async () => {
    const { config, status } = get();
    if (!config.autoStartOnGoLive || status?.running) return;
    await get().start();
  },
}));

export function syncNdiPreview(scene: unknown) {
  const { config, status } = useNdiStore.getState();
  if (!status?.running || !config.enablePreviewOutput) return;
  void api.pushPreviewUpdate(scene);
}

export { defaultStatus };
