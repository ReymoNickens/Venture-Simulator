import { kvGet, kvSet, outboxAll, SIMULATE_KEY } from "./idb";
import type { ConnectionState } from "@/lib/domain/types";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeConnection(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function isSimulatingOffline(): Promise<boolean> {
  return Boolean(await kvGet<boolean>(SIMULATE_KEY));
}

export async function setSimulatingOffline(value: boolean): Promise<void> {
  await kvSet(SIMULATE_KEY, value);
  emit();
}

export function browserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function isEffectivelyOnline(): Promise<boolean> {
  if (await isSimulatingOffline()) return false;
  return browserOnline();
}

export async function readConnectionState(): Promise<ConnectionState> {
  const online = await isEffectivelyOnline();
  const pending = await outboxAll();
  const syncing = pending.some((i) => i.status === "syncing");
  const errored = pending.some((i) => i.status === "error");
  const queued = pending.some((i) => i.status === "pending" || i.status === "error");
  if (!online && queued) return "saved_locally";
  if (!online) return "offline";
  if (syncing) return "syncing";
  if (errored) return "sync_error";
  if (queued) return "saved_locally";
  return "synced";
}

if (typeof window !== "undefined") {
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
}

export { emit as emitConnectionChange };
