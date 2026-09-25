import {
  addCanvasEntry,
  logInterview,
  logPrototypeTest,
  respondToMarketEvent,
  saveReflection,
} from "@/lib/server/venture-work";

/**
 * Server functions that may be queued while offline and replayed later.
 * Field work belongs here — interviews happen in hostels and markets, not
 * next to a router. Each entry must be idempotent on `clientId` (or safe to
 * repeat), because a replay can follow a request that did reach the server.
 */
export const OFFLINE_CALLS = {
  logInterview,
  logPrototypeTest,
  addCanvasEntry,
  saveReflection,
  respondToMarketEvent,
} as const;

export type OfflineCallName = keyof typeof OFFLINE_CALLS;
