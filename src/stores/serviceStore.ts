import { create } from "zustand";
import { previewServiceItem, presentServiceItem } from "@/lib/serviceLive";
import {
  defaultContentForType,
  stringifyServiceItemContent,
} from "@/lib/serviceItemContent";
import { getServiceTemplate } from "@/lib/serviceTemplates";
import { api, type ServiceItem, type ServicePlanDetail, type ServicePlanSummary } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";
import { notifyServiceItemAdded } from "@/stores/toastStore";
import { useThemeStore } from "@/stores/themeStore";

const STORAGE_KEY = "bsp-service-context";
const DEFAULT_PLAN_TITLE = "Quick service";

interface ServiceContext {
  planId: string | null;
  itemId: string | null;
}

interface ServiceState {
  plans: ServicePlanSummary[];
  activePlan: ServicePlanDetail | null;
  activeItemId: string | null;
  saving: boolean;
  dirty: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  loadPlans: () => Promise<void>;
  ensureActivePlan: (title?: string) => Promise<ServicePlanDetail>;
  selectPlan: (id: string) => Promise<void>;
  selectItem: (id: string, options?: { preview?: boolean }) => Promise<void>;
  createPlan: (title: string) => Promise<void>;
  createPlanFromTemplate: (templateId: string) => Promise<void>;
  duplicatePlan: (id: string) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  updatePlanMeta: (args: { title?: string; serviceDate?: string; notes?: string; themeId?: string }) => Promise<void>;
  addItem: (itemType: string, title: string, contentJson?: string, options?: { notify?: boolean; select?: boolean }) => Promise<ServiceItem | null>;
  updateItem: (id: string, patch: { title?: string; contentJson?: string; operatorNotes?: string }) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  reorderItems: (itemIds: string[]) => Promise<void>;
  importScriptureList: (text: string) => Promise<number>;
  previewActiveItem: () => Promise<void>;
  goLiveActiveItem: () => Promise<void>;
  nextItem: () => Promise<void>;
  prevItem: () => Promise<void>;
  markDirty: () => void;
  autosave: () => Promise<void>;
}

let autosaveTimer: number | undefined;

function loadContext(): ServiceContext {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ServiceContext;
  } catch {
    // ignore
  }
  return { planId: null, itemId: null };
}

function saveContext(planId: string | null, itemId: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ planId, itemId }));
}

function syncPresentationPlanId(planId: string | null) {
  usePresentationStore.setState({ activePlanId: planId ?? undefined });
}

function activeTheme() {
  return useThemeStore.getState().activeTheme;
}

function findItem(plan: ServicePlanDetail | null, itemId: string | null): ServiceItem | null {
  if (!plan || !itemId) return null;
  return plan.items.find((item) => item.id === itemId) ?? null;
}

function resolveItemId(plan: ServicePlanDetail | null, preferredId: string | null): string | null {
  if (!plan || plan.items.length === 0) return null;
  if (preferredId && plan.items.some((item) => item.id === preferredId)) return preferredId;
  return plan.items[0]?.id ?? null;
}

function itemNumberFor(plan: ServicePlanDetail, itemId: string): number {
  const index = plan.items.findIndex((item) => item.id === itemId);
  return index >= 0 ? index + 1 : plan.items.length;
}

export const useServiceStore = create<ServiceState>((set, get) => ({
  plans: [],
  activePlan: null,
  activeItemId: null,
  saving: false,
  dirty: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    const context = loadContext();
    await get().loadPlans();

    if (context.planId) {
      try {
        const activePlan = await api.getServicePlan(context.planId);
        const activeItemId = resolveItemId(activePlan, context.itemId);
        syncPresentationPlanId(activePlan.id);
        set({ activePlan, activeItemId, initialized: true });
        return;
      } catch {
        saveContext(null, null);
      }
    }

    const plans = get().plans;
    if (plans.length > 0) {
      await get().selectPlan(plans[0]!.id);
    }

    set({ initialized: true });
  },

  loadPlans: async () => {
    const plans = await api.listServicePlans();
    set({ plans });
  },

  ensureActivePlan: async (title = DEFAULT_PLAN_TITLE) => {
    const existing = get().activePlan;
    if (existing) return existing;

    const plans = get().plans;
    if (plans.length > 0) {
      await get().selectPlan(plans[0]!.id);
      return get().activePlan!;
    }

    await get().createPlan(title);
    return get().activePlan!;
  },

  selectPlan: async (id) => {
    const activePlan = await api.getServicePlan(id);
    const activeItemId = resolveItemId(activePlan, get().activeItemId);
    syncPresentationPlanId(activePlan.id);
    saveContext(activePlan.id, activeItemId);
    set({ activePlan, activeItemId, dirty: false });
  },

  selectItem: async (id, options = { preview: true }) => {
    const plan = get().activePlan;
    if (!plan) return;

    const item = plan.items.find((entry) => entry.id === id);
    if (!item) return;

    saveContext(plan.id, id);
    set({ activeItemId: id });

    if (options.preview === false) return;

    const liveFollow = usePresentationStore.getState().liveFollow;
    if (liveFollow) {
      await presentServiceItem(item, activeTheme());
    } else {
      await previewServiceItem(item, activeTheme());
    }
  },

  createPlan: async (title) => {
    const activePlan = await api.createServicePlan(title);
    await get().loadPlans();
    syncPresentationPlanId(activePlan.id);
    saveContext(activePlan.id, null);
    set({ activePlan, activeItemId: null, dirty: false });
  },

  createPlanFromTemplate: async (templateId) => {
    const template = getServiceTemplate(templateId);
    if (!template) return;

    const created = await api.createServicePlan(template.title);
    for (const templateItem of template.items) {
      const content = templateItem.content ?? defaultContentForType(templateItem.type);
      await api.createServiceItem({
        planId: created.id,
        itemType: templateItem.type,
        title: templateItem.title,
        contentJson: stringifyServiceItemContent(content),
      });
    }

    const activePlan = await api.getServicePlan(created.id);
    const activeItemId = resolveItemId(activePlan, null);
    await get().loadPlans();
    syncPresentationPlanId(activePlan.id);
    saveContext(activePlan.id, activeItemId);
    set({ activePlan, activeItemId, dirty: false });

    if (activeItemId) {
      await get().selectItem(activeItemId);
    }
  },

  duplicatePlan: async (id) => {
    const activePlan = await api.duplicateServicePlan(id);
    await get().loadPlans();
    const activeItemId = resolveItemId(activePlan, null);
    syncPresentationPlanId(activePlan.id);
    saveContext(activePlan.id, activeItemId);
    set({ activePlan, activeItemId, dirty: false });
  },

  deletePlan: async (id) => {
    await api.deleteServicePlan(id);
    await get().loadPlans();
    syncPresentationPlanId(null);
    saveContext(null, null);
    set({ activePlan: null, activeItemId: null });
  },

  updatePlanMeta: async (args) => {
    const plan = get().activePlan;
    if (!plan) return;
    const activePlan = await api.updateServicePlan({ id: plan.id, ...args });
    await get().loadPlans();
    set({ activePlan, dirty: false });
  },

  addItem: async (itemType, title, contentJson, options = {}) => {
    const { notify = true, select = true } = options;
    const plan = await get().ensureActivePlan();

    const created = await api.createServiceItem({
      planId: plan.id,
      itemType,
      title,
      contentJson: contentJson ?? stringifyServiceItemContent(defaultContentForType(itemType)),
    });

    await get().selectPlan(plan.id);

    if (select) {
      await get().selectItem(created.id);
    }

    get().markDirty();

    if (notify) {
      const refreshed = get().activePlan;
      if (refreshed) {
        notifyServiceItemAdded(title, refreshed.title, itemNumberFor(refreshed, created.id));
      }
    }

    return created;
  },

  updateItem: async (id, patch) => {
    await api.updateServiceItem({ id, ...patch });
    const plan = get().activePlan;
    if (!plan) return;
    await get().selectPlan(plan.id);
    if (get().activeItemId === id) {
      await get().previewActiveItem();
    }
    get().markDirty();
  },

  removeItem: async (id) => {
    const plan = get().activePlan;
    if (!plan) return;

    const index = plan.items.findIndex((item) => item.id === id);
    const fallback = plan.items[index + 1]?.id ?? plan.items[index - 1]?.id ?? null;

    await api.deleteServiceItem(id);
    await get().selectPlan(plan.id);

    if (fallback) {
      await get().selectItem(fallback);
    } else {
      saveContext(plan.id, null);
      set({ activeItemId: null });
    }
  },

  reorderItems: async (itemIds) => {
    const plan = get().activePlan;
    if (!plan) return;
    await api.reorderServiceItems(plan.id, itemIds);
    await get().selectPlan(plan.id);
  },

  importScriptureList: async (text) => {
    const plan = await get().ensureActivePlan();
    const items = await api.importScriptureList(plan.id, text);
    await get().selectPlan(plan.id);
    if (items.length > 0) {
      await get().selectItem(items[items.length - 1]!.id);
      notifyServiceItemAdded(
        `${items.length} scriptures`,
        get().activePlan?.title ?? plan.title,
        itemNumberFor(get().activePlan ?? plan, items[items.length - 1]!.id),
      );
    }
    get().markDirty();
    return items.length;
  },

  previewActiveItem: async () => {
    const item = findItem(get().activePlan, get().activeItemId);
    if (!item) return;
    await previewServiceItem(item, activeTheme());
  },

  goLiveActiveItem: async () => {
    const item = findItem(get().activePlan, get().activeItemId);
    if (!item) return;
    await presentServiceItem(item, activeTheme());
  },

  nextItem: async () => {
    const { activePlan, activeItemId } = get();
    if (!activePlan || activePlan.items.length === 0) return;

    const index = activePlan.items.findIndex((item) => item.id === activeItemId);
    const nextIndex = index < 0 ? 0 : Math.min(index + 1, activePlan.items.length - 1);
    if (activePlan.items[nextIndex]) {
      await get().selectItem(activePlan.items[nextIndex]!.id);
    }
  },

  prevItem: async () => {
    const { activePlan, activeItemId } = get();
    if (!activePlan || activePlan.items.length === 0) return;

    const index = activePlan.items.findIndex((item) => item.id === activeItemId);
    const prevIndex = index < 0 ? 0 : Math.max(index - 1, 0);
    if (activePlan.items[prevIndex]) {
      await get().selectItem(activePlan.items[prevIndex]!.id);
    }
  },

  markDirty: () => {
    set({ dirty: true });
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      void get().autosave();
    }, 2500);
  },

  autosave: async () => {
    const { activePlan, dirty } = get();
    if (!activePlan || !dirty) return;
    set({ saving: true });
    try {
      await api.updateServicePlan({ id: activePlan.id, title: activePlan.title });
      set({ dirty: false });
    } finally {
      set({ saving: false });
    }
  },
}));
