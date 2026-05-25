import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Eye,
  FolderOpen,
  Layers,
  MonitorPlay,
  Plus,
  Radio,
  Share2,
  Signal,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/pill";
import { formatDate } from "@/lib/utils";
import { useServiceStore } from "@/stores/serviceStore";
import { useBibleStore } from "@/stores/bibleStore";
import { useNdiStore } from "@/stores/ndiStore";

const quickActions = [
  { label: "New Service", shortcut: "⌘N", icon: Plus, to: "/service", accent: false },
  { label: "Open Service", shortcut: "⌘O", icon: FolderOpen, to: "/service", accent: false },
  { label: "Search Bible", shortcut: "⌘B", icon: BookOpen, to: "/bible", accent: false },
  { label: "Start Presentation", shortcut: "⌘L", icon: Radio, to: "/bible", accent: true },
  { label: "Browse Media", shortcut: "⌘M", icon: Layers, to: "/media", accent: false },
  { label: "Share Remote", shortcut: "⌘R", icon: Share2, to: "/settings", accent: false },
];

export function DashboardPage() {
  const { plans, loadPlans, selectPlan } = useServiceStore();
  const { translations, loadTranslations } = useBibleStore();
  const ndiRunning = useNdiStore((s) => s.status?.running);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([loadPlans(), loadTranslations()]).then(() => setReady(true));
  }, [loadPlans, loadTranslations]);

  const upcomingPlan = plans[0];
  const recentPlans = plans.slice(0, 4);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar breadcrumbs={["Dashboard", "Grace Community Church"]} />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          {/* Hero card */}
          <div className="panel overflow-hidden">
            <div className="border-b border-[var(--color-border)] px-5 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                <span className="status-dot status-dot-green" />
                Up next · In 18 min
              </div>
              <p className="mt-1 text-xs text-[var(--color-subtle)]">
                {formatDate(upcomingPlan?.service_date)} · 10:30 AM
              </p>
            </div>
            <div className="p-5">
              <h1 className="text-2xl font-bold tracking-tight">
                {upcomingPlan?.title ?? "Sunday Morning Service"}
              </h1>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {upcomingPlan
                  ? `${upcomingPlan.item_count} items · Theme: Ridge — Dark · Operator: J. Marks`
                  : "Create a service plan to get started"}
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  to="/bible"
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                >
                  <Signal className="h-4 w-4" />
                  Start Presentation
                </Link>
                <Link
                  to="/service"
                  onClick={() => upcomingPlan && void selectPlan(upcomingPlan.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-foreground)]"
                >
                  <Eye className="h-4 w-4" />
                  Open Plan
                </Link>
              </div>
              {/* Slide thumbnails strip */}
              <div className="mt-5 flex gap-2 overflow-x-auto">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-12 w-16 shrink-0 items-end rounded-md border border-[var(--color-border-light)] bg-[var(--color-background)] p-1"
                  >
                    <span className="text-[9px] text-[var(--color-subtle)]">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="panel p-4">
            <p className="section-label mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(({ label, shortcut, icon: Icon, to, accent }) => (
                <Link
                  key={label}
                  to={to}
                  className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] p-3 transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-panel-hover)]"
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`h-4 w-4 ${accent ? "text-red-400" : "text-[var(--color-muted-foreground)]"}`} />
                    <span className="text-[10px] text-[var(--color-subtle)]">{shortcut}</span>
                  </div>
                  <span className="text-xs font-medium">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Recent plans */}
          <div className="panel">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-semibold">Recent Service Plans</p>
              <Link to="/service" className="text-xs text-[var(--color-primary)] hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {recentPlans.length === 0 ? (
                <p className="p-4 text-xs text-[var(--color-subtle)]">No service plans yet.</p>
              ) : (
                recentPlans.map((plan, i) => (
                  <Link
                    key={plan.id}
                    to="/service"
                    onClick={() => void selectPlan(plan.id)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-panel-hover)]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{plan.title}</p>
                        {i === 0 && <StatusBadge variant="ready">Last service</StatusBadge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--color-subtle)]">
                        {plan.item_count} items · Ridge — Dark
                      </p>
                    </div>
                    <span className="text-[11px] text-[var(--color-subtle)]">{formatDate(plan.service_date)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Upcoming + System status */}
          <div className="space-y-4">
            <div className="panel">
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <p className="text-sm font-semibold">Upcoming</p>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {[
                  { day: "TUE", date: "03", title: "Worship Rehearsal", time: "7:00 PM", status: "draft" as const },
                  { day: "WED", date: "04", title: "Midweek Service", time: "7:00 PM", status: "ready" as const },
                ].map((event) => (
                  <div key={event.title} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[var(--color-surface)] text-center">
                      <span className="text-[9px] font-bold text-[var(--color-subtle)]">{event.day}</span>
                      <span className="text-sm font-bold">{event.date}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-[11px] text-[var(--color-subtle)]">{event.time}</p>
                    </div>
                    <StatusBadge variant={event.status}>{event.status}</StatusBadge>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <p className="section-label mb-3">System Status</p>
              <div className="space-y-2">
                {[
                  { label: "Bible Versions", ok: translations.length > 0 },
                  { label: "Main Display", ok: ready },
                  { label: "Confidence Monitor", ok: false },
                  { label: "Stream Output", ok: ndiRunning ?? false },
                  { label: "Remote Access", ok: false },
                  { label: "Cloud Sync", ok: false },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-muted-foreground)]">{label}</span>
                    <span className={`status-dot ${ok ? "status-dot-green" : "status-dot-yellow"}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent scriptures strip */}
        <div className="panel mt-4 p-4">
          <p className="section-label mb-3">Recent Scriptures & Media</p>
          <div className="flex gap-3 overflow-x-auto">
            {["John 3:16", "Psalm 23", "Romans 8:28"].map((ref) => (
              <Link
                key={ref}
                to="/bible"
                className="flex h-20 w-32 shrink-0 flex-col justify-end rounded-lg border border-[var(--color-border-light)] bg-[var(--color-background)] p-2 hover:border-[var(--color-primary)]"
              >
                <p className="text-[10px] font-semibold text-[var(--color-primary)]">{ref}</p>
                <p className="line-clamp-2 text-[9px] text-[var(--color-subtle)]">Tap to open in Bible search</p>
              </Link>
            ))}
            <Link
              to="/media"
              className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-light)] text-[10px] text-[var(--color-subtle)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <MonitorPlay className="mr-1 h-3 w-3" />
              Browse media
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
