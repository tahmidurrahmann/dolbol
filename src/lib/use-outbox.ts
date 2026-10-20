"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getOpsForTrip,
  removeOp,
  updateOp,
  type ExpenseCreatePayload,
  type OutboxOp,
} from "@/lib/outbox";
import { syncOutboxForTrip } from "@/lib/sync-engine";

export interface UseOutboxReturn {
  ops: OutboxOp[];
  pendingOps: OutboxOp[];
  rejectedOps: OutboxOp[];
  pendingCount: number;
  isSyncing: boolean;
  unauthorizedError: boolean;
  triggerSync: () => Promise<void>;
  discardOp: (opId: string) => Promise<void>;
  editPendingOp: (
    opId: string,
    updates: Partial<ExpenseCreatePayload>,
  ) => Promise<void>;
}

export function useOutbox(tripSlug: string): UseOutboxReturn {
  const router = useRouter();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [unauthorizedError, setUnauthorizedError] = useState<boolean>(false);
  const syncingRef = useRef<boolean>(false);

  const loadOps = useCallback(async () => {
    try {
      const current = await getOpsForTrip(tripSlug);
      setOps(current);
    } catch (err) {
      console.warn("Failed to load outbox ops:", err);
    }
  }, [tripSlug]);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const res = await syncOutboxForTrip(tripSlug);
      setUnauthorizedError(res.unauthorized);

      await loadOps();

      if (res.synced > 0) {
        // Refresh server components to show synced data
        router.refresh();
      }
    } catch (err) {
      console.warn("Sync error:", err);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [tripSlug, loadOps, router]);

  // Load ops and trigger initial sync on mount
  useEffect(() => {
    loadOps();

    if (typeof window !== "undefined") {
      // 1. Initial sync on app load
      triggerSync();

      // 2. Browser online event
      const handleOnline = () => {
        triggerSync();
      };

      // 3. Document visibility change
      const handleVisibilityChange = () => {
        if (
          document.visibilityState === "visible" &&
          typeof navigator !== "undefined" &&
          navigator.onLine
        ) {
          triggerSync();
        }
      };

      // 4. Custom event when an op is enqueued or updated
      const handleOutboxChange = (e: Event) => {
        const customEvent = e as CustomEvent<{ tripSlug?: string }>;
        if (
          !customEvent.detail?.tripSlug ||
          customEvent.detail.tripSlug === tripSlug
        ) {
          loadOps();
          if (navigator.onLine) {
            triggerSync();
          }
        }
      };

      window.addEventListener("online", handleOnline);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("app:outbox-change", handleOutboxChange);

      return () => {
        window.removeEventListener("online", handleOnline);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("app:outbox-change", handleOutboxChange);
      };
    }
  }, [tripSlug, loadOps, triggerSync]);

  // Warn before leaving if unsynced ops exist
  const pendingOps = ops.filter(
    (o) => o.status === "pending" || o.status === "syncing" || o.status === "failed",
  );
  const rejectedOps = ops.filter((o) => o.status === "rejected");
  const pendingCount = pendingOps.length;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingCount > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    if (pendingCount > 0) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }
  }, [pendingCount]);

  const discardOp = useCallback(
    async (opId: string) => {
      await removeOp(opId);
      await loadOps();
    },
    [loadOps],
  );

  const editPendingOp = useCallback(
    async (opId: string, updates: Partial<ExpenseCreatePayload>) => {
      const current = ops.find((o) => o.opId === opId);
      if (!current) return;

      await updateOp(opId, {
        payload: {
          ...current.payload,
          ...updates,
        },
        status: "pending",
        lastError: null,
      });

      await loadOps();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        triggerSync();
      }
    },
    [ops, loadOps, triggerSync],
  );

  return {
    ops,
    pendingOps,
    rejectedOps,
    pendingCount,
    isSyncing,
    unauthorizedError,
    triggerSync,
    discardOp,
    editPendingOp,
  };
}
