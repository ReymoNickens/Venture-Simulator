import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useConnection, connectionCopy } from "@/hooks/use-connection";
import { Button } from "@/components/ui/button";

export function ConnectionBar() {
  const { state, simulating, toggleSimulatedOffline, retry } = useConnection();
  const copy = connectionCopy(state);
  const offlineish = state === "offline" || state === "saved_locally" || state === "sync_error";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg-elevated/80 px-4 py-2 text-xs backdrop-blur-sm">
      <div className="flex items-center gap-2 text-ink-soft">
        {offlineish ? (
          <WifiOff className="size-3.5" aria-hidden />
        ) : (
          <Wifi className="size-3.5" aria-hidden />
        )}
        <span
          className={
            copy.tone === "bad" ? "text-bad" : copy.tone === "warn" ? "text-warn" : "text-muted"
          }
        >
          {copy.label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {state === "sync_error" ? (
          <button
            type="button"
            onClick={() => void retry()}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs text-ink-soft hover:bg-bg-subtle"
          >
            <RefreshCw className="size-3" /> Retry sync
          </button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void toggleSimulatedOffline()}
          className="h-8 text-xs text-muted"
        >
          {simulating ? "End offline test" : "Simulate offline"}
        </Button>
      </div>
    </div>
  );
}
