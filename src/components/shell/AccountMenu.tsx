import { useEffect, useRef, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { connectionCopy, useConnection } from "@/hooks/use-connection";
import { cn } from "@/lib/utils";

/**
 * One round button for everything about "me": who I am, whether my work has
 * synced, and signing out. Connection shows as a small dot until it matters.
 */
export function AccountMenu({ name }: { name?: string | null }) {
  const user = useCurrentUser();
  const { state, simulating, toggleSimulatedOffline, retry } = useConnection();
  const copy = connectionCopy(state);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = name ?? user?.displayName ?? user?.primaryEmail ?? "Account";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const dot = copy.tone === "ok" ? "bg-mint" : copy.tone === "warn" ? "bg-gold" : "bg-clay";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label} — ${copy.label}`}
        className="relative flex size-10 items-center justify-center rounded-full bg-ink font-display text-base font-bold text-white"
      >
        {label.charAt(0).toUpperCase()}
        <span className={cn("absolute right-0 bottom-0 size-3 rounded-full border-2 border-bg", dot)} />
      </button>
      {open ? (
        <div className="rise absolute right-0 top-12 z-40 w-64 rounded-[18px] border border-line bg-bg-elevated p-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
          <p className="px-3 pt-2 font-semibold">{label}</p>
          <p className="flex items-center gap-2 px-3 pb-2 text-xs text-muted">
            <span className={cn("size-2 rounded-full", dot)} /> {copy.label}
          </p>
          {state === "sync_error" || state === "saved_locally" ? (
            <MenuItem onClick={() => void retry()}>
              <RefreshCw className="size-4" aria-hidden /> Sync now
            </MenuItem>
          ) : null}
          <MenuItem onClick={() => void toggleSimulatedOffline()}>
            <span className="size-4" aria-hidden /> {simulating ? "End offline rehearsal" : "Rehearse offline"}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setLeaving(true);
              void signOut().catch(() => setLeaving(false));
            }}
          >
            <LogOut className="size-4" aria-hidden /> {leaving ? "Signing out…" : "Sign out"}
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-[22px] px-3 py-2.5 text-left text-sm hover:bg-bg-subtle">
      {children}
    </button>
  );
}
