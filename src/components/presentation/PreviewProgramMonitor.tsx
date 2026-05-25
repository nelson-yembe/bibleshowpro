import { SceneRenderer } from "@/components/presentation/SceneRenderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Scene } from "@/engine/scene";

interface PreviewProgramMonitorProps {
  preview: Scene | null;
  program: Scene | null;
}

export function PreviewProgramMonitor({ preview, program }: PreviewProgramMonitorProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-video overflow-hidden rounded-lg border border-[var(--color-border)]">
            <SceneRenderer scene={preview} label="Preview empty" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-red-300">Program (Live)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-video overflow-hidden rounded-lg border border-red-900/50">
            <SceneRenderer scene={program} label="Program empty" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
