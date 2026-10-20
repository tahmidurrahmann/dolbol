import type { ExpenseCategoryValue, SplitTypeValue } from "@/lib/money";

export type OutboxOpStatus = "pending" | "syncing" | "failed" | "rejected";

export interface ExpenseCreatePayload {
  id: string; // Client-generated UUID for the expense
  title: string;
  amount: number; // Integer taka
  category: ExpenseCategoryValue;
  expenseDate: string; // "YYYY-MM-DD" entered by the user, never sync time!
  paidById: string;
  splitType: SplitTypeValue;
  participantIds?: string[];
  exactShares?: Array<{ memberId: string; amount: number }>;
  percentShares?: Array<{ memberId: string; percent: number }>;
  note?: string | null;
  rawInput?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  placeName?: string | null;
}

export interface OutboxOp {
  opId: string; // Unique UUID of this outbox item
  tripSlug: string;
  type: "expense.create";
  payload: ExpenseCreatePayload;
  createdAt: string; // ISO date string
  status: OutboxOpStatus;
  attempts: number;
  lastError?: string | null;
}

const DB_NAME = "app_outbox_db";
const DB_VERSION = 1;
const STORE_NAME = "outbox_ops";

// Fallback in-memory store for environments where IndexedDB is unavailable (SSR, tests, private Safari)
const memoryStore = new Map<string, OutboxOp>();

function isIndexedDbAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.indexedDB !== "undefined" &&
    window.indexedDB !== null
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      return reject(new Error("IndexedDB not available"));
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "opId" });
          store.createIndex("by_trip", "tripSlug", { unique: false });
          store.createIndex("by_status", "status", { unique: false });
          store.createIndex("by_created", "createdAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

function notifyOutboxChange(tripSlug?: string): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("app:outbox-change", {
          detail: { tripSlug },
        }),
      );
    } catch {
      // Ignore if CustomEvent fails in limited environment
    }
  }
}

/**
 * Enqueue a new operation to the outbox.
 * Safe against storage errors.
 */
export async function enqueueOp(op: OutboxOp): Promise<void> {
  try {
    if (isIndexedDbAvailable()) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(op);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    } else {
      memoryStore.set(op.opId, { ...op });
    }
  } catch (err) {
    // If IndexedDB fails, fall back to memory store so the operation is never lost in-session
    console.warn("IndexedDB write failed, falling back to in-memory store:", err);
    memoryStore.set(op.opId, { ...op });
  }

  notifyOutboxChange(op.tripSlug);
}

/**
 * Retrieve all ops for a specific trip, ordered by createdAt ascending.
 */
export async function getOpsForTrip(tripSlug: string): Promise<OutboxOp[]> {
  try {
    if (isIndexedDbAvailable()) {
      const db = await openDb();
      const ops = await new Promise<OutboxOp[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as OutboxOp[]) || [];
          const filtered = all
            .filter((o) => o.tripSlug === tripSlug)
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          resolve(filtered);
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
      return ops;
    }
  } catch (err) {
    console.warn("IndexedDB read failed, falling back to memory store:", err);
  }

  return Array.from(memoryStore.values())
    .filter((o) => o.tripSlug === tripSlug)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

/**
 * Update an existing outbox operation (e.g. status, attempts, lastError).
 */
export async function updateOp(
  opId: string,
  updates: Partial<OutboxOp>,
): Promise<void> {
  let tripSlug: string | undefined;

  try {
    if (isIndexedDbAvailable()) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(opId);
        getReq.onsuccess = () => {
          const current = getReq.result as OutboxOp | undefined;
          if (current) {
            tripSlug = current.tripSlug;
            const updated: OutboxOp = { ...current, ...updates, opId };
            const putReq = store.put(updated);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
          } else {
            resolve();
          }
        };
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => db.close();
      });
    }
  } catch (err) {
    console.warn("IndexedDB update failed, updating memory store:", err);
  }

  const inMem = memoryStore.get(opId);
  if (inMem) {
    tripSlug = inMem.tripSlug;
    memoryStore.set(opId, { ...inMem, ...updates, opId });
  }

  notifyOutboxChange(tripSlug);
}

/**
 * Remove an op from the outbox (after successful sync or user discard).
 */
export async function removeOp(opId: string): Promise<void> {
  let tripSlug: string | undefined;

  try {
    if (isIndexedDbAvailable()) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(opId);
        getReq.onsuccess = () => {
          const current = getReq.result as OutboxOp | undefined;
          if (current) {
            tripSlug = current.tripSlug;
          }
          const delReq = store.delete(opId);
          delReq.onsuccess = () => resolve();
          delReq.onerror = () => reject(delReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => db.close();
      });
    }
  } catch (err) {
    console.warn("IndexedDB delete failed:", err);
  }

  const inMem = memoryStore.get(opId);
  if (inMem) {
    tripSlug = inMem.tripSlug;
    memoryStore.delete(opId);
  }

  notifyOutboxChange(tripSlug);
}

/**
 * Clear all outbox items for a specific trip.
 */
export async function clearOpsForTrip(tripSlug: string): Promise<void> {
  try {
    if (isIndexedDbAvailable()) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as OutboxOp[]) || [];
          for (const item of all) {
            if (item.tripSlug === tripSlug) {
              store.delete(item.opId);
            }
          }
          resolve();
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    }
  } catch (err) {
    console.warn("IndexedDB clear failed:", err);
  }

  for (const [key, val] of memoryStore.entries()) {
    if (val.tripSlug === tripSlug) {
      memoryStore.delete(key);
    }
  }

  notifyOutboxChange(tripSlug);
}

/**
 * Clears the fallback memory store (useful in unit tests).
 */
export function _resetMemoryOutbox(): void {
  memoryStore.clear();
}
