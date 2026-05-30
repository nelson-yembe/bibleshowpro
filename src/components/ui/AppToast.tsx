import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useToastStore } from "@/stores/toastStore";

export function AppToast() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-14 right-4 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[#0f1219] px-3 py-2.5 shadow-xl"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--color-foreground)]">{toast.message}</p>
            {toast.linkTo && (
              <Link
                to={toast.linkTo}
                onClick={() => dismiss(toast.id)}
                className="mt-1 inline-block text-[11px] font-medium text-[var(--color-primary)] hover:underline"
              >
                {toast.linkLabel ?? "View"}
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
