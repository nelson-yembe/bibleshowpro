import { cn } from "@/lib/utils";

interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Pill({ active, className, children, ...props }: PillProps) {
  return (
    <button
      type="button"
      className={cn("pill", active && "pill-active", className)}
      {...props}
    >
      {children}
    </button>
  );
}

interface SegmentedProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
}

export function Segmented({ options, value, onChange, size = "sm" }: SegmentedProps) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
            value === opt.value
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({
  variant,
  children,
}: {
  variant: "live" | "preview" | "draft" | "ready" | "warn" | "saved";
  children: React.ReactNode;
}) {
  const styles = {
    live: "bg-red-950/50 border-red-800/50 text-red-300",
    preview: "bg-blue-950/50 border-blue-800/50 text-blue-300",
    draft: "bg-amber-950/50 border-amber-800/50 text-amber-300",
    ready: "bg-emerald-950/50 border-emerald-800/50 text-emerald-300",
    warn: "bg-amber-950/50 border-amber-800/50 text-amber-300",
    saved: "bg-emerald-950/50 border-emerald-800/50 text-emerald-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        styles[variant],
      )}
    >
      {variant === "live" && <span className="status-dot status-dot-red" />}
      {variant === "preview" && <span className="status-dot status-dot-green" />}
      {children}
    </span>
  );
}
