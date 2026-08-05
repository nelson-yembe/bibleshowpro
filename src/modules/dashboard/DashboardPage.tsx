import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Layers,
  Monitor,
  Music2,
  Play,
  Plus,
  Radio,
  Signal,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/pill";
import type { Scene } from "@/engine/scene";
import {
  formatItemType,
  isPresentableServiceItem,
  SERVICE_ITEM_COLORS,
} from "@/lib/serviceItemMeta";
import type { ServiceItem } from "@/lib/tauri";
import { cn, formatDate } from "@/lib/utils";
import { useBibleStore } from "@/stores/bibleStore";
import { useNdiStore } from "@/stores/ndiStore";
import {
  isPresentationOnAir,
  type PreviewSource,
  usePresentationStore,
} from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";

function sceneHeadline(scene: Scene | null | undefined): string | null {
  if (!scene || scene.type === "logo" || scene.type === "blank" || scene.type === "blackout") {
    return null;
  }
  return (
    scene.content.reference ||
    scene.content.title ||
    scene.content.speakerName ||
    scene.content.body?.slice(0, 48) ||
    scene.type.replace(/_/g, " ")
  );
}

function continuePath(source: PreviewSource): string {
  switch (source) {
    case "song":
      return "/songs";
    case "media":
      return "/media";
    case "service":
      return "/service";
    case "transcription":
      return "/listen";
    case "bible":
    default:
      return "/bible";
  }
}

function recentScriptureRefs(history: Scene[], preview: Scene | null, limit = 6): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const scene of [preview, ...history]) {
    const ref = scene?.content.reference?.trim();
    if (!ref || seen.has(ref.toLowerCase())) continue;
    seen.add(ref.toLowerCase());
    refs.push(ref);
    if (refs.length >= limit) break;
  }
  return refs;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const initService = useServiceStore((s) => s.init);
  const plans = useServiceStore((s) => s.plans);
  const activePlan = useServiceStore((s) => s.activePlan);
  const activeItemId = useServiceStore((s) => s.activeItemId);
  const selectPlan = useServiceStore((s) => s.selectPlan);
  const selectItem = useServiceStore((s) => s.selectItem);
  const goLiveActiveItem = useServiceStore((s) => s.goLiveActiveItem);
  const createPlanFromTemplate = useServiceStore((s) => s.createPlanFromTemplate);
  const createPlan = useServiceStore((s) => s.createPlan);

  const translations = useBibleStore((s) => s.translations);
  const loadTranslations = useBibleStore((s) => s.loadTranslations);
  const themes = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const loadThemes = useThemeStore((s) => s.loadThemes);
  const ndiRunning = useNdiStore((s) => s.status?.running);
  const refreshNdi = useNdiStore((s) => s.refreshStatus);

  const outputOpen = usePresentationStore((s) => s.outputOpen);
  const preview = usePresentationStore((s) => s.preview);
  const program = usePresentationStore((s) => s.program);
  const history = usePresentationStore((s) => s.history);
  const previewSource = usePresentationStore((s) => s.previewSource);
  const syncOutputStatus = usePresentationStore((s) => s.syncOutputStatus);
  const goLive = usePresentationStore((s) => s.goLive);
  const onAir = usePresentationStore((s) => isPresentationOnAir(s));

  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      initService(),
      loadTranslations(),
      loadThemes(),
      syncOutputStatus(),
      refreshNdi(),
    ]).finally(() => setBooting(false));
  }, [initService, loadTranslations, loadThemes, syncOutputStatus, refreshNdi]);

  const themeName = useMemo(() => {
    const planThemeId = activePlan?.theme_id;
    const theme =
      themes.find((t) => t.id === planThemeId) ??
      themes.find((t) => t.id === activeThemeId) ??
      themes.find((t) => t.is_default) ??
      themes[0];
    return theme?.name ?? "Default theme";
  }, [activePlan?.theme_id, themes, activeThemeId]);

  const activeItem = useMemo(() => {
    if (!activePlan || !activeItemId) return null;
    return activePlan.items.find((item) => item.id === activeItemId) ?? null;
  }, [activePlan, activeItemId]);

  const firstPresentable = useMemo(() => {
    if (!activePlan) return null;
    return activePlan.items.find((item) => isPresentableServiceItem(item)) ?? null;
  }, [activePlan]);

  const focusItem = activeItem && isPresentableServiceItem(activeItem) ? activeItem : firstPresentable;

  const presentableCount = useMemo(
    () => activePlan?.items.filter((item) => isPresentableServiceItem(item)).length ?? 0,
    [activePlan],
  );

  const previewLabel = sceneHeadline(preview);
  const programLabel = sceneHeadline(program);
  const scriptureRecents = useMemo(
    () => recentScriptureRefs(history, preview),
    [history, preview],
  );

  const otherPlans = plans.filter((p) => p.id !== activePlan?.id).slice(0, 5);

  const readiness = [
    {
      label: "Bible versions",
      ok: translations.length > 0,
      detail: translations.length > 0 ? `${translations.length} loaded` : "Import in Settings",
    },
    {
      label: "Projector",
      ok: outputOpen,
      detail: outputOpen ? "Window open" : "Not open",
    },
    {
      label: "Program",
      ok: onAir,
      detail: onAir ? programLabel ?? "On air" : "Standby",
    },
    {
      label: "Theme",
      ok: true,
      detail: themeName,
    },
    {
      label: "NDI output",
      ok: !!ndiRunning,
      detail: ndiRunning ? "Streaming" : "Off",
    },
  ];

  const openService = async (planId?: string, itemId?: string) => {
    if (planId) await selectPlan(planId);
    if (itemId) await selectItem(itemId, { preview: true });
    navigate("/service");
  };

  const handleGoLive = async () => {
    if (!activePlan || !focusItem) return;
    setBusy(true);
    try {
      await selectItem(focusItem.id, { preview: true });
      await goLiveActiveItem();
      navigate("/service");
    } finally {
      setBusy(false);
    }
  };

  const handleContinuePreview = async () => {
    if (previewLabel && preview) {
      setBusy(true);
      try {
        await goLive();
        navigate(continuePath(previewSource));
      } finally {
        setBusy(false);
      }
    }
  };

  const handleNewFromTemplate = async () => {
    setBusy(true);
    try {
      await createPlanFromTemplate("sunday-am");
      navigate("/service");
    } finally {
      setBusy(false);
    }
  };

  const handleBlankPlan = async () => {
    setBusy(true);
    try {
      await createPlan("New service");
      navigate("/service");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar breadcrumbs={["Home"]} status={onAir ? "live" : "ready"} />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* Active service hero */}
          <div className="panel overflow-hidden">
            {booting ? (
              <div className="p-8 text-sm text-[var(--color-subtle)]">Loading service…</div>
            ) : !activePlan ? (
              <EmptyServiceState
                busy={busy}
                onTemplate={handleNewFromTemplate}
                onBlank={handleBlankPlan}
              />
            ) : (
              <>
                <div className="border-b border-[var(--color-border)] px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {onAir ? (
                      <StatusBadge variant="live">Live</StatusBadge>
                    ) : (
                      <StatusBadge variant="ready">Ready</StatusBadge>
                    )}
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                      Active service
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-subtle)]">
                    {formatDate(activePlan.service_date)}
                    {focusItem ? ` · Next: ${focusItem.title}` : ""}
                  </p>
                </div>

                <div className="p-5">
                  <h1 className="text-2xl font-bold tracking-tight">{activePlan.title}</h1>
                  <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                    {activePlan.items.length} items
                    {presentableCount !== activePlan.items.length
                      ? ` · ${presentableCount} presentable`
                      : ""}
                    {" · "}
                    Theme: {themeName}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !focusItem}
                      onClick={() => void handleGoLive()}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                    >
                      <Signal className="h-4 w-4" />
                      {onAir ? "Take next live" : "GO LIVE"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openService(activePlan.id, focusItem?.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-foreground)]"
                    >
                      <Play className="h-4 w-4" />
                      Open run sheet
                    </button>
                    <Link
                      to="/bible"
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-foreground)]"
                    >
                      <BookOpen className="h-4 w-4" />
                      Bible search
                    </Link>
                  </div>

                  <RunSheetStrip
                    items={activePlan.items}
                    activeItemId={activeItemId}
                    onSelect={(item) => void openService(activePlan.id, item.id)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Readiness + launch */}
          <div className="space-y-4">
            <div className="panel p-4">
              <p className="section-label mb-3">Output readiness</p>
              <div className="space-y-2.5">
                {readiness.map(({ label, ok, detail }) => (
                  <div key={label} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-[var(--color-muted-foreground)]">{label}</p>
                      <p className="truncate text-[10px] text-[var(--color-subtle)]">{detail}</p>
                    </div>
                    <span
                      className={cn(
                        "status-dot mt-1 shrink-0",
                        ok ? "status-dot-green" : "status-dot-yellow",
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <p className="section-label mb-3">Jump in</p>
              <div className="grid grid-cols-1 gap-2">
                <LaunchLink to="/service" icon={Layers} label="Service run sheet" />
                <LaunchLink to="/bible" icon={BookOpen} label="Search Bible" />
                <LaunchLink to="/songs" icon={Music2} label="Songs & lyrics" />
                <LaunchLink to="/media" icon={Monitor} label="Media library" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Resume */}
          <div className="panel">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-semibold">Resume</p>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {previewLabel ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                      Staged preview
                    </p>
                    <p className="truncate text-sm font-medium">{previewLabel}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleContinuePreview()}
                    className="shrink-0 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    GO LIVE
                  </button>
                </div>
              ) : null}

              {onAir && programLabel ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                      On program
                    </p>
                    <p className="truncate text-sm font-medium">{programLabel}</p>
                  </div>
                  <Link
                    to={continuePath(previewSource)}
                    className="shrink-0 rounded-md border border-[var(--color-border-light)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  >
                    Open
                  </Link>
                </div>
              ) : null}

              {focusItem && activePlan ? (
                <button
                  type="button"
                  onClick={() => void openService(activePlan.id, focusItem.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--color-panel-hover)]"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                      Run sheet cue
                    </p>
                    <p className="truncate text-sm font-medium">{focusItem.title}</p>
                    <p className="text-[11px] capitalize text-[var(--color-subtle)]">
                      {formatItemType(focusItem.item_type)}
                    </p>
                  </div>
                  <Radio className="h-4 w-4 shrink-0 text-[var(--color-subtle)]" />
                </button>
              ) : null}

              {!previewLabel && !onAir && !focusItem ? (
                <p className="p-4 text-xs text-[var(--color-subtle)]">
                  Stage a verse, song, or service item — it will show up here to take live.
                </p>
              ) : null}
            </div>
          </div>

          {/* Other plans */}
          <div className="panel">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-semibold">Service plans</p>
              <Link to="/service" className="text-xs text-[var(--color-primary)] hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {plans.length === 0 ? (
                <p className="p-4 text-xs text-[var(--color-subtle)]">No plans yet.</p>
              ) : (
                <>
                  {activePlan ? (
                    <PlanRow
                      title={activePlan.title}
                      meta={`${activePlan.items.length} items · ${formatDate(activePlan.service_date)}`}
                      badge="Active"
                      onClick={() => void openService(activePlan.id)}
                    />
                  ) : null}
                  {otherPlans.map((plan) => (
                    <PlanRow
                      key={plan.id}
                      title={plan.title}
                      meta={`${plan.item_count} items · ${formatDate(plan.service_date ?? plan.updated_at)}`}
                      onClick={() => void openService(plan.id)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recent scriptures from real presentation history */}
        <div className="panel mt-4 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="section-label mb-0">Recent scriptures</p>
            <Link to="/bible" className="text-xs text-[var(--color-primary)] hover:underline">
              Bible search
            </Link>
          </div>
          {scriptureRecents.length === 0 ? (
            <p className="text-xs text-[var(--color-subtle)]">
              Presented verses will appear here after you stage or go live from Bible Search.
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto">
              {scriptureRecents.map((ref) => (
                <Link
                  key={ref}
                  to="/bible"
                  className="flex h-20 w-36 shrink-0 flex-col justify-end rounded-lg border border-[var(--color-border-light)] bg-[var(--color-background)] p-2.5 hover:border-[var(--color-primary)]"
                >
                  <p className="text-xs font-semibold text-[var(--color-primary)]">{ref}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">Open in Bible</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyServiceState({
  busy,
  onTemplate,
  onBlank,
}: {
  busy: boolean;
  onTemplate: () => void;
  onBlank: () => void;
}) {
  return (
    <div className="p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
        Get ready for service
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">No active service plan</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
        Build a run sheet, or jump straight into Bible Search and take a verse live.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onTemplate}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Sunday AM template
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBlank}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          Blank plan
        </button>
        <Link
          to="/bible"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-foreground)]"
        >
          <BookOpen className="h-4 w-4" />
          Search a verse
        </Link>
      </div>
    </div>
  );
}

function RunSheetStrip({
  items,
  activeItemId,
  onSelect,
}: {
  items: ServiceItem[];
  activeItemId: string | null;
  onSelect: (item: ServiceItem) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-5 text-xs text-[var(--color-subtle)]">
        This plan is empty — open the run sheet to add scripture, songs, or media.
      </p>
    );
  }

  return (
    <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
      {items.slice(0, 10).map((item, index) => {
        const isSection = item.item_type === "section";
        const active = item.id === activeItemId;
        const color = SERVICE_ITEM_COLORS[item.item_type] ?? "bg-slate-500";
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              "flex h-[4.5rem] w-[5.5rem] shrink-0 flex-col rounded-md border p-1.5 text-left transition-colors",
              active
                ? "border-[var(--color-primary)] bg-[var(--color-panel-hover)]"
                : "border-[var(--color-border-light)] bg-[var(--color-background)] hover:border-[var(--color-border)]",
              isSection && "opacity-70",
            )}
          >
            <div className="flex items-center gap-1">
              {!isSection ? <span className={cn("h-1.5 w-1.5 rounded-full", color)} /> : null}
              <span className="text-[9px] text-[var(--color-subtle)]">
                {isSection ? "§" : index + 1}
              </span>
            </div>
            <p className="mt-auto line-clamp-2 text-[10px] font-medium leading-tight">
              {item.title || formatItemType(item.item_type)}
            </p>
          </button>
        );
      })}
      {items.length > 10 ? (
        <div className="flex h-[4.5rem] w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--color-border-light)] text-[10px] text-[var(--color-subtle)]">
          +{items.length - 10}
        </div>
      ) : null}
    </div>
  );
}

function PlanRow({
  title,
  meta,
  badge,
  onClick,
}: {
  title: string;
  meta: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-panel-hover)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
          {badge ? <StatusBadge variant="ready">{badge}</StatusBadge> : null}
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--color-subtle)]">{meta}</p>
      </div>
    </button>
  );
}

function LaunchLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof BookOpen;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-medium transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-panel-hover)]"
    >
      <Icon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
      {label}
    </Link>
  );
}
