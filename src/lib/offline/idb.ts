const DB_PREFIX = "evp-offline";
const DB_VERSION = 1;

/**
 * Offline data is partitioned per signed-in account: one IndexedDB database
 * per auth user id. Phones are often shared between students — with a single
 * shared store, student B signing in on A's phone would replay A's queued
 * evidence under B's session, filing A's work as B's. Now B simply cannot
 * see A's queue; it waits, intact, until A signs in again.
 */
let owner: string | null = null;
const handles = new Map<string, Promise<IDBDatabase>>();

export function setOfflineOwner(userId: string | null): void {
  owner = userId;
}

export function getOfflineOwner(): string | null {
  return owner;
}

function dbName(): string {
  // Without a known account nothing may be read or queued — use a scratch
  // store that sync never dispatches from (processOutbox requires an owner).
  return owner ? `${DB_PREFIX}:${owner}` : `${DB_PREFIX}:anonymous`;
}

export type OutboxItem = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  status: "pending" | "syncing" | "error" | "done";
};

function openDb(): Promise<IDBDatabase> {
  const name = dbName();
  let handle = handles.get(name);
  if (!handle) {
    handle = openNamed(name).catch((err) => {
      handles.delete(name);
      throw err;
    });
    handles.set(name, handle);
  }
  return handle;
}

function openNamed(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    const req = fn(s);
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    if (req) {
      req.onerror = () => reject(req.error);
    }
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return withStore<T>("kv", "readonly", (s) => s.get(key));
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await withStore("kv", "readwrite", (s) => s.put(value, key));
}

export async function outboxPut(item: OutboxItem): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.put(item));
}

export async function outboxGet(id: string): Promise<OutboxItem | undefined> {
  return withStore("outbox", "readonly", (s) => s.get(id));
}

export async function outboxAll(): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const req = tx.objectStore("outbox").getAll();
    req.onsuccess = () => {
      const items = (req.result as OutboxItem[]).filter((i) => i.status !== "done");
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function outboxDelete(id: string): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.delete(id));
}

export async function blobPut(id: string, blob: Blob): Promise<void> {
  await withStore("blobs", "readwrite", (s) => s.put(blob, id));
}

export async function blobGet(id: string): Promise<Blob | undefined> {
  return withStore("blobs", "readonly", (s) => s.get(id));
}

/** Small cached strings (e.g. evidence photo data URLs) keyed by id. */
export async function cacheGet(id: string): Promise<string | undefined> {
  return withStore<string | undefined>("blobs", "readonly", (s) => s.get(`c:${id}`));
}

export async function cachePut(id: string, value: string): Promise<void> {
  await withStore("blobs", "readwrite", (s) => s.put(value, `c:${id}`));
}

export const SIMULATE_KEY = "simulateOffline";
export const SNAPSHOT_KEY = "workspaceSnapshot";
