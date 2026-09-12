import { useEffect, useState } from "react";
import type { ConnectionState } from "@/lib/domain/types";
import {
  isSimulatingOffline,
  readConnectionState,
  setSimulatingOffline,
  subscribeConnection,
} from "@/lib/offline/status";
import { processOutbox } from "@/lib/offline/sync";

export function useConnection() {
  const [state, setState] = useState<ConnectionState>("online");
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [next, sim] = await Promise.all([readConnectionState(), isSimulatingOffline()]);
      if (!cancelled) {
        setState(next);
        setSimulating(sim);
      }
    };
    void refresh();
    const unsub = subscribeConnection(() => void refresh());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return {
    state,
    simulating,
    async toggleSimulatedOffline() {
      await setSimulatingOffline(!simulating);
      if (simulating) void processOutbox();
    },
    retry: () => processOutbox(),
  };
}

export function connectionCopy(state: ConnectionState): { label: string; tone: "ok" | "warn" | "bad" } {
  switch (state) {
    case "offline":
      return { label: "Working offline", tone: "warn" };
    case "saved_locally":
      return { label: "Saved locally — will sync when connected", tone: "warn" };
    case "syncing":
      return { label: "Syncing…", tone: "ok" };
    case "synced":
      return { label: "Synced", tone: "ok" };
    case "sync_error":
      return { label: "Saved locally — unable to sync yet", tone: "bad" };
    default:
      return { label: "Online", tone: "ok" };
  }
}
