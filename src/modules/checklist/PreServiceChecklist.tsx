import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/tauri";
import { useBibleStore } from "@/stores/bibleStore";

interface PreServiceChecklistProps {
  outputOpen: boolean;
  planSelected: boolean;
}

export function PreServiceChecklist({ outputOpen, planSelected }: PreServiceChecklistProps) {
  const { translations } = useBibleStore();
  const [mediaCount, setMediaCount] = useState(0);

  useEffect(() => {
    void api.listMedia().then((items) => setMediaCount(items.length));
  }, []);

  const checks = [
    { label: "Bible translations available", ok: translations.length > 0 },
    { label: "Service plan selected", ok: planSelected },
    { label: "Audience output window open", ok: outputOpen },
    { label: "Media library configured", ok: mediaCount >= 0 },
  ];

  const complete = checks.filter((c) => c.ok).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Pre-Service Checklist ({complete}/{checks.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 text-sm">
            {check.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <Circle className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            )}
            {check.label}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
