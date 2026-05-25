import { Outlet, useLocation } from "react-router-dom";
import { IconRail } from "@/components/layout/IconRail";
import { StatusBar } from "@/components/layout/StatusBar";
import { LiveControlsPanel } from "@/components/presentation/LiveControlsPanel";
import { useLiveKeyboard } from "@/hooks/useLiveKeyboard";
import { useLiveDisplayStore } from "@/stores/liveDisplayStore";

const LIVE_DOCK_ROUTES = ["/", "/bible", "/service", "/media", "/songs", "/listen"];

export function AppShell() {
  const { pathname } = useLocation();
  const showLiveDock = LIVE_DOCK_ROUTES.some(
    (route) => pathname === route || (route !== "/" && pathname.startsWith(route)),
  );
  const displayOptions = useLiveDisplayStore((s) => s.displayOptions);

  useLiveKeyboard();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-background)]">
      <IconRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
          {showLiveDock && <LiveControlsPanel displayOptions={displayOptions} />}
        </div>
        <StatusBar />
      </div>
    </div>
  );
}
