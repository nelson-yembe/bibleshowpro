import { useEffect, useState } from "react";
import { api, type RemoteStatus } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";

/**
 * Turn on the church-network server: the congregation follows the screen on their phones,
 * and the operator or preacher can drive it from a phone with the PIN.
 */
export function PhoneViewPanel() {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewScene = usePresentationStore((s) => s.previewScene);

  useEffect(() => {
    api.getRemoteStatus().then(setStatus, () => setStatus(null));
  }, []);

  const run = async (work: () => Promise<RemoteStatus | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      if (next) setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const showQrOnProjector = () =>
    run(async () => {
      const path = await api.writePhoneQrSlide();
      previewScene(
        { id: crypto.randomUUID(), type: "image", content: { title: "Phone view", imagePath: path }, transition: "fade" },
        "media",
      );
    });

  if (!status) {
    return <p className="text-[11px] text-[var(--color-subtle)]">Available in the desktop app.</p>;
  }

  const phoneUrl = status.phoneUrls[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
          Phones on the church Wi-Fi open the live verse, lyrics and captions, with no app to install. The first time,
          Windows may ask whether Bible Show Pro can use the network: allow it on private networks.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => (status.running ? api.stopRemoteServer() : api.startRemoteServer()))}
          className={status.running ? "control-btn shrink-0" : "control-btn-primary shrink-0"}
        >
          {status.running ? "Turn off" : "Turn on"}
        </button>
      </div>

      {status.running && !phoneUrl && (
        <p className="text-[11px] text-amber-400">
          This PC is not on a local network, so phones cannot reach it. Connect it to the church Wi-Fi or router.
        </p>
      )}

      {status.running && phoneUrl && (
        <div className="grid gap-4 rounded-lg border border-[var(--color-border-light)] p-3 sm:grid-cols-[140px_1fr]">
          {status.qrSvg && (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(status.qrSvg)}`}
              alt={`QR code for ${phoneUrl}`}
              className="h-[140px] w-[140px] rounded bg-white"
            />
          )}
          <div className="min-w-0 space-y-2 text-[12px]">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">Congregation</p>
              <p className="font-mono text-[var(--color-foreground)]">{phoneUrl}</p>
              {status.phoneUrls.length > 1 && (
                <p className="text-[10px] text-[var(--color-subtle)]">
                  Also: {status.phoneUrls.slice(1).join(" · ")}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">Remote control</p>
              <p className="font-mono text-[var(--color-foreground)]">{phoneUrl}remote</p>
              <p className="text-[var(--color-muted-foreground)]">
                PIN <span className="font-mono text-base font-semibold tracking-[0.2em] text-[var(--color-foreground)]">{status.pin}</span>
                <span className="ml-2 text-[10px] text-[var(--color-subtle)]">new each time it is turned on</span>
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => void showQrOnProjector()} className="control-btn text-[11px]">
              Stage the QR code in preview
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-amber-400">{error}</p>}
    </div>
  );
}
