import { Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TopBarProps {
  breadcrumbs: string[];
  status?: "ready" | "live";
  actions?: React.ReactNode;
}

export function TopBar({ breadcrumbs, status = "ready", actions }: TopBarProps) {
  const statusLabel = status === "live" ? "LIVE" : "STANDBY";
  const statusColor = status === "live" ? "text-red-400" : "text-[var(--color-success)]";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={`${crumb}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span className="text-[var(--color-subtle)]">›</span>}
            <span
              className={cn(
                i === breadcrumbs.length - 1
                  ? "truncate font-medium text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-foreground)]",
              )}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {actions}
        <div className={cn("flex items-center gap-1.5 text-[11px] font-semibold tracking-wide", statusColor)}>
          <Wifi className="h-3.5 w-3.5" />
          {statusLabel}
        </div>
        <Link
          to="/settings"
          className="text-[11px] text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
        >
          Settings
        </Link>
      </div>
    </header>
  );
}
