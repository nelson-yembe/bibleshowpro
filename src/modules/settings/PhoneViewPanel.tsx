import { useEffect, useState } from "react";
import { api, type FirewallStatus, type RemoteStatus } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";

/** Wi-Fi changes (or a laptop moving to a phone's hotspot) change the address phones need. */
const ADDRESS_REFRESH_MS = 10_000;

/**
 * Turn on the church-network server: the congregation follows the screen on their phones,
 * and the operator or preacher can drive it from a phone with the PIN.
 */
export function PhoneViewPanel() {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewScene = usePresentationStore((s) => s.previewScene);

  useEffect(() => {
    api.getRemoteStatus().then(setStatus, () => setStatus(null));
  }, []);

  const running = status?.running ?? false;
  const network = status?.addresses[0]?.url;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      api.getRemoteStatus().then(setStatus, () => {});
    }, ADDRESS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  // Asked again whenever the network changes: a private network can block what a public one allowed.
  useEffect(() => {
    setFirewall(null);
    if (!running || !network) return;
    let cancelled = false;
    api.checkRemoteFirewall().then(
      (result) => !cancelled && setFirewall(result),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [running, network]);

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

  const checkFirewallAgain = () =>
    run(async () => {
      setFirewall(await api.checkRemoteFirewall());
    });

  if (!status) {
    return <p className="text-[11px] text-[var(--color-subtle)]">Available in the desktop app.</p>;
  }

  const [primary, ...others] = status.addresses;
  const profileName = firewall?.profile.toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
          Phones on the same Wi-Fi as this PC open the live verse, lyrics and captions, with no app to install.
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

      {status.running && !primary && (
        <p className="text-[11px] text-amber-400">
          This PC is not on a local network, so phones cannot reach it. Connect it to the church Wi-Fi or router.
        </p>
      )}

      {firewall && !firewall.allowed && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-[11px] leading-relaxed text-amber-200">
          <p>
            Windows Firewall is stopping phones from reaching this PC on this {profileName} network. Open the firewall
            settings, choose <span className="font-semibold">Change settings</span>, find{" "}
            <span className="font-semibold">bible-show-pro</span> (or Bible Show Pro) and tick{" "}
            <span className="font-semibold">{firewall.profile}</span>, then OK.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void api.openFirewallSettings()} className="control-btn text-[11px]">
              Open firewall settings
            </button>
            <button type="button" disabled={busy} onClick={() => void checkFirewallAgain()} className="control-btn text-[11px]">
              Check again
            </button>
          </div>
        </div>
      )}

      {status.running && primary && (
        <div className="grid gap-4 rounded-lg border border-[var(--color-border-light)] p-3 sm:grid-cols-[140px_1fr]">
          {status.qrSvg && (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(status.qrSvg)}`}
              alt={`QR code for ${primary.url}`}
              className="h-[140px] w-[140px] rounded bg-white"
            />
          )}
          <div className="min-w-0 space-y-2 text-[12px]">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
                Congregation · {primary.adapter}
              </p>
              <p className="font-mono text-[var(--color-foreground)]">{primary.url}</p>
              {others.length > 0 && (
                <p className="text-[10px] text-[var(--color-subtle)]">
                  Phones on another network of this PC:{" "}
                  {others.map((a) => `${a.url} (${a.adapter})`).join(" · ")}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">Remote control</p>
              <p className="font-mono text-[var(--color-foreground)]">{primary.url}remote</p>
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
