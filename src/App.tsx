import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { BibleSearchPage } from "@/modules/bible/BibleSearchPage";
import { ServiceBuilderPage } from "@/modules/service/ServiceBuilderPage";
import { LivePresentationPage } from "@/modules/presentation/LivePresentationPage";
import { ThemeEditorPage } from "@/modules/themes/ThemeEditorPage";
import { MediaLibraryPage } from "@/modules/media/MediaLibraryPage";
import { SongsPage } from "@/modules/songs/SongsPage";
import { SettingsPage } from "@/modules/settings/SettingsPage";
import { BibleSetupPrompt } from "@/modules/settings/BibleSetupPrompt";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect } from "react";
import { api } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useThemeStore } from "@/stores/themeStore";
import { useOutputDisplayManager } from "@/hooks/useOutputDisplayManager";
import { useNdiStore } from "@/stores/ndiStore";

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const hydrate = usePresentationStore((s) => s.hydrate);
  const initService = useServiceStore((s) => s.init);
  const loadMedia = useMediaStore((s) => s.loadMedia);
  const loadThemes = useThemeStore((s) => s.loadThemes);
  useOutputDisplayManager();
  const loadNdi = useNdiStore((s) => s.loadConfig);

  useEffect(() => {
    void api.initApp();
    hydrate();
    void loadThemes();
    void initService();
    void loadMedia();
    void loadNdi();
  }, [hydrate, initService, loadMedia, loadThemes, loadNdi]);

  return (
    <>
      {children}
      <BibleSetupPrompt />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppBootstrap>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="bible" element={<BibleSearchPage />} />
              <Route path="service" element={<ServiceBuilderPage />} />
              <Route path="present" element={<LivePresentationPage />} />
              <Route path="themes" element={<ThemeEditorPage />} />
              <Route path="media" element={<MediaLibraryPage />} />
              <Route path="songs" element={<SongsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AppBootstrap>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
