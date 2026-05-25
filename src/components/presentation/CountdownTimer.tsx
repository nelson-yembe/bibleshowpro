import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePresentationStore } from "@/stores/presentationStore";

export function CountdownTimer() {
  const previewScene = usePresentationStore((s) => s.previewScene);
  const [seconds, setSeconds] = useState(300);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const start = () => {
    setRemaining(seconds);
    previewScene({
      id: crypto.randomUUID(),
      type: "countdown",
      content: { countdownSeconds: seconds, body: formatTime(seconds) },
      transition: "none",
    });
  };

  useEffect(() => {
    if (remaining === null) return;
    previewScene({
      id: crypto.randomUUID(),
      type: "countdown",
      content: { countdownSeconds: remaining, body: formatTime(remaining) },
      transition: "none",
    });
  }, [remaining, previewScene]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Countdown Timer</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Seconds
          <Input type="number" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
        </label>
        <Button onClick={start}>Start Countdown Preview</Button>
        {remaining !== null && (
          <p className="text-2xl font-semibold tabular-nums">{formatTime(remaining)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(total: number) {
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}
