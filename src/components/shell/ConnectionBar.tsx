import * as Popover from "@radix-ui/react-popover";
import { CloudOff, RefreshCw, Wifi, CloudUpload, AlertTriangle } from "lucide-react";
import { useConnection, connectionCopy } from "@/hooks/use-connection";
import { UserButton } from "@/lib/auth/gates";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Always-visible sync status, so a student never wonders whether their work is saved. */
export function ConnectionPill() {
  const { state } = useConnection();
  const copy = connectionCopy(state);
  const Icon = state === "offline" || state === "saved_locally" ? CloudOff : state === "sync_error" ? AlertTriangle : state === "syncing" ? CloudUpload : Wifi;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        copy.tone === "ok" && "bg-accent-soft text-accent",
        copy.tone === "warn" && "bg-sun-soft text-[#8a5a0f]",
        copy.tone === "bad" && "bg-bad-soft text-bad",
      )}
    >
      <Icon className={cn("size-3.5", state === "syncing" && "animate-pulse")} aria-hidden />
      <span className="max-w-[9rem] truncate sm:max-w-none">{state === "saved_locally" ? "Saved on phone" : state === "sync_error" ? "Not synced yet" : copy.label}</span>
    </span>
  );
}

export function AccountMenu({ name }: { name: string }) {
  const { state, simulating, toggleSimulatedOffline, retry } = useConnection();
  return (
    <Popover.Root>
      <Popover.Trigger className="rounded-full" aria-label="Account and connection">
        <Avatar name={name || "You"} size={34} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-72 animate-pop rounded-[18px] border border-line bg-bg-elevated p-4 shadow-[var(--shadow-lift)]">
          <UserButton />
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <p className="text-xs text-muted">{connectionCopy(state).label}. Everything you write is kept on this phone first and synced when there's signal.</p>
            {state === "sync_error" ? (
              <button type="button" onClick={() => void retry()} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 font-semibold hover:bg-bg-subtle">
                <RefreshCw className="size-4" /> Try syncing now
              </button>
            ) : null}
            <button type="button" onClick={() => void toggleSimulatedOffline()} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 font-semibold hover:bg-bg-subtle">
              <CloudOff className="size-4" /> {simulating ? "End offline practice" : "Practise working offline"}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
