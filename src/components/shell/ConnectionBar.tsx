import { useEffect, useRef, useState } from "react";
import { CloudOff, Cloud, RefreshCw, TriangleAlert } from "lucide-react";
import { useConnection, connectionCopy } from "@/hooks/use-connection";
import { cn } from "@/lib/utils";

/**
 * Connection state in plain words, always visible but small. Tapping it opens
 * the details: retry a stuck sync, or rehearse working offline.
 */
export function ConnectionPill() {
  const { state, simulating, toggleSimulatedOffline, retry } = useConnection();
  const copy = connectionCopy(state);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const offlineish = state === "offline" || state === "saved_locally" || state === "sync_error";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const Icon = state === "sync_error" ? TriangleAlert : offlineish ? CloudOff : state === "syncing" ? RefreshCw : Cloud;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={copy.label}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-full border-2 px-2.5 text-xs font-semibold",
          copy.tone === "ok" && "border-accent/40 bg-accent-soft text-accent",
          copy.tone === "warn" && "border-warn/50 bg-warn-soft text-warn",
          copy.tone === "bad" && "border-clay/50 bg-clay-soft text-clay",
        )}
      >
        <Icon className={cn("size-4", state === "syncing" && "animate-spin")} aria-hidden />
        <span className="hidden sm:inline">{copy.short}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-72 rounded-[10px] border-2 border-ink bg-bg-elevated p-3 text-sm shadow-[4px_4px_0_0_var(--color-ink)]">
          <p className="font-semibold">{copy.label}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Your work is saved on this phone first and sent when there is a connection. Nothing you
            save is lost if the network drops.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "sync_error" || state === "saved_locally" ? (
              <button
                type="button"
                onClick={() => void retry()}
                className="inline-flex h-8 items-center gap-1 rounded-[6px] border-2 border-ink px-2 text-xs font-semibold"
              >
                <RefreshCw className="size-3" aria-hidden /> Sync now
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void toggleSimulatedOffline()}
              className="inline-flex h-8 items-center rounded-[6px] border-2 border-line-strong px-2 text-xs"
            >
              {simulating ? "End offline rehearsal" : "Rehearse offline"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
