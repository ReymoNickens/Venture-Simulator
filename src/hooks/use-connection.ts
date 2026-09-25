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

export function connectionCopy(state: ConnectionState): {
  label: string;
  short: string;
  tone: "ok" | "warn" | "bad";
} {
  switch (state) {
    case "offline":
      return { label: "Working offline", short: "Offline", tone: "warn" };
    case "saved_locally":
      return { label: "Saved locally — will sync when connected", short: "Saved on phone", tone: "warn" };
    case "syncing":
      return { label: "Syncing…", short: "Syncing", tone: "ok" };
    case "synced":
      return { label: "Synced", short: "Synced", tone: "ok" };
    case "sync_error":
      return { label: "Saved locally — unable to sync yet", short: "Not synced", tone: "bad" };
    default:
      return { label: "Online", short: "Online", tone: "ok" };
  }
}
