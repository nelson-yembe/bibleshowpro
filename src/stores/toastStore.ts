import { create } from "zustand";

export interface ToastMessage {
  id: string;
  message: string;
  linkTo?: string;
  linkLabel?: string;
}

interface ToastState {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, "id">) => void;
  dismiss: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = `toast-${Date.now()}-${toastCounter++}`;
    set({ toasts: [...get().toasts, { ...toast, id }] });
    window.setTimeout(() => get().dismiss(id), 6000);
  },

  dismiss: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export function notifyServiceItemAdded(title: string, planTitle: string, itemNumber: number) {
  useToastStore.getState().push({
    message: `Added “${title}” to ${planTitle} (item ${itemNumber})`,
    linkTo: "/service",
    linkLabel: "Open Library",
  });
}
