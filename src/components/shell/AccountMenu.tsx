import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FlaskConical, LogOut, RefreshCw, Users } from "lucide-react";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { connectionCopy, useConnection } from "@/hooks/use-connection";
import { cn } from "@/lib/utils";

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

/**
 * One round button for everything about "me": who I am, whether my work has
 * synced, and signing out. The offline rehearsal is only offered in the
 * demonstration cohort, where it is a teaching aid rather than a stray
 * developer switch in front of every student.
 */
export function AccountMenu({
  name,
  canRehearse,
  isClassRep = false,
}: {
  name?: string | null;
  canRehearse: boolean;
  isClassRep?: boolean;
}) {
  const user = useCurrentUser();
  const { state, simulating, toggleSimulatedOffline, retry } = useConnection();
  const copy = connectionCopy(state);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = name ?? user?.displayName ?? user?.primaryEmail ?? "Account";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const dot = copy.tone === "ok" ? "bg-mint" : copy.tone === "warn" ? "bg-gold" : "bg-clay";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label}, ${copy.label}`}
        className="relative flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-elevated font-display text-base font-semibold text-ink"
      >
        {label.charAt(0).toUpperCase()}
      </button>
      {open ? (
        <div className="rise absolute top-13 right-0 z-40 w-64 rounded-[14px] border border-line bg-bg-elevated p-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
          <p className="px-3 pt-2 font-semibold">{label}</p>
          <p className="flex items-center gap-2 px-3 pb-2 text-xs text-muted">
            <span className={cn("size-2 rounded-full", dot)} /> {copy.label}
          </p>
          {state === "sync_error" || state === "saved_locally" ? (
            <MenuItem onClick={() => void retry()}>
              <RefreshCw className="size-4" aria-hidden /> Sync now
            </MenuItem>
          ) : null}
          {isClassRep ? (
            <Link
              to="/studio/class"
              onClick={() => setOpen(false)}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-[14px] px-3 text-left text-sm hover:bg-bg-subtle"
            >
              <Users className="size-4" aria-hidden /> Class list
            </Link>
          ) : null}
          {canRehearse || simulating ? (
            <MenuItem onClick={() => void toggleSimulatedOffline()}>
              <FlaskConical className="size-4" aria-hidden />
              {simulating ? "End offline rehearsal" : "Rehearse working offline"}
            </MenuItem>
          ) : null}
          {authEnabled && !gateSession ? (
            <MenuItem
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                // Success navigates away; on failure re-enable so it can be retried.
                void signOut().catch(() => setLeaving(false));
              }}
            >
              <LogOut className="size-4" aria-hidden /> {leaving ? "Signing out…" : "Sign out"}
            </MenuItem>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-[14px] px-3 text-left text-sm hover:bg-bg-subtle disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  );
}
