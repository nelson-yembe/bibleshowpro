import type { Scene } from "@/engine/scene";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import type { PreviewSource } from "@/stores/presentationStore";

export function isPlaceholderScene(scene: Scene | null | undefined): boolean {
  if (!scene) return true;
  return scene.type === "logo" || scene.type === "blank";
}

/** Scene staged for the next take — preview first, then non-placeholder program. */
export function resolveStagedScene(preview: Scene | null, program: Scene | null): Scene | null {
  if (preview && !isPlaceholderScene(preview)) return preview;
  if (program && !isPlaceholderScene(program)) return program;
  return preview ?? program;
}

export async function refreshPreviewBeforeGoLive(source: PreviewSource): Promise<void> {
  const handlers = useLiveNavigationStore.getState().handlers;
  if (handlers?.beforeGoLive) {
    await handlers.beforeGoLive();
    return;
  }

  if (source === "song") {
    const { useSongStore } = await import("@/stores/songStore");
    await useSongStore.getState().previewCurrent();
    return;
  }

  if (source === "service") {
    const { useServiceStore } = await import("@/stores/serviceStore");
    const { previewServiceItem } = await import("@/lib/serviceLive");
    const { useThemeStore } = await import("@/stores/themeStore");
    const plan = useServiceStore.getState().activePlan;
    const itemId = useServiceStore.getState().activeItemId;
    const item = plan?.items.find((i) => i.id === itemId);
    if (item) await previewServiceItem(item, useThemeStore.getState().activeTheme);
    return;
  }

  if (source === "media") {
    const { useMediaStore } = await import("@/stores/mediaStore");
    const { previewMediaItem } = await import("@/lib/mediaLive");
    const { useThemeStore } = await import("@/stores/themeStore");
    const item = useMediaStore.getState().selectedItem();
    if (item) await previewMediaItem(item, useThemeStore.getState().activeTheme);
    return;
  }

  if (source === "transcription") {
    // Preview is already staged from Live Listen suggestion cards.
    return;
  }
}
