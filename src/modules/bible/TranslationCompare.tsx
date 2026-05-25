import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/tauri";

interface TranslationCompareProps {
  reference: string;
  primaryTranslationId?: string;
  secondaryTranslationId?: string;
  translations: { id: string; abbreviation: string }[];
}

export function TranslationCompare({
  reference,
  primaryTranslationId,
  secondaryTranslationId,
  translations,
}: TranslationCompareProps) {
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!primaryTranslationId || !secondaryTranslationId || !reference.trim()) {
      setPrimary(null);
      setSecondary(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [a, b] = await Promise.all([
          api.lookupReference(reference, primaryTranslationId),
          api.lookupReference(reference, secondaryTranslationId),
        ]);
        if (cancelled) return;
        setPrimary(a.search.verses.map((v) => v.text).join(" "));
        setSecondary(b.search.verses.map((v) => v.text).join(" "));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reference, primaryTranslationId, secondaryTranslationId]);

  if (translations.length < 2 || !secondaryTranslationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Translation Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Select two Bible versions in the sidebar to compare both translations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const primaryAbbr = translations.find((t) => t.id === primaryTranslationId)?.abbreviation;
  const secondaryAbbr = translations.find((t) => t.id === secondaryTranslationId)?.abbreviation;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {reference} · {primaryAbbr} / {secondaryAbbr}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {primaryAbbr}
          </p>
          <p className="leading-relaxed">{loading && !primary ? "Loading…" : (primary ?? "—")}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] italic">
            {secondaryAbbr}
          </p>
          <p className="leading-relaxed italic">{loading && !secondary ? "Loading…" : (secondary ?? "—")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
