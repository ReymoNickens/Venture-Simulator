const DB_NAME = "evp-offline";
const DB_VERSION = 1;

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
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

export const SIMULATE_KEY = "simulateOffline";
export const SNAPSHOT_KEY = "workspaceSnapshot";
