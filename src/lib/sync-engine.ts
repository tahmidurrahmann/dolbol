import {
  getOpsForTrip,
  removeOp,
  updateOp,
  type OutboxOp,
} from "@/lib/outbox";

export interface SyncEngineResult {
  total: number;
  synced: number;
  failed: number;
  rejected: number;
  unauthorized: boolean;
  stoppedOnNetworkError: boolean;
}

export type SyncFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Synchronizes outbox operations for a specific trip strictly in chronological order.
 * Safe against network interruption and idempotent.
 */
export async function syncOutboxForTrip(
  tripSlug: string,
  customFetcher?: SyncFetcher,
): Promise<SyncEngineResult> {
  const fetcher = customFetcher || fetch;

  const result: SyncEngineResult = {
    total: 0,
    synced: 0,
    failed: 0,
    rejected: 0,
    unauthorized: false,
    stoppedOnNetworkError: false,
  };

  // Check if browser is currently offline before making requests
  if (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  ) {
    result.stoppedOnNetworkError = true;
    return result;
  }

  const ops = await getOpsForTrip(tripSlug);
  result.total = ops.length;

  for (const op of ops) {
    // Rejected ops require user correction or discard; do not auto-sync
    if (op.status === "rejected") {
      result.rejected += 1;
      continue;
    }

    // Mark as syncing
    await updateOp(op.opId, {
      status: "syncing",
      attempts: (op.attempts || 0) + 1,
    });

    let res: Response;
    try {
      res = await fetcher(`/api/trips/${encodeURIComponent(tripSlug)}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op.payload),
      });
    } catch (networkErr) {
      // Network failure: mark op as failed and STOP immediately
      await updateOp(op.opId, {
        status: "failed",
        lastError:
          networkErr instanceof Error ? networkErr.message : "network_error",
      });
      result.failed += 1;
      result.stoppedOnNetworkError = true;
      break;
    }

    if (res.status === 200 || res.status === 201) {
      // Success! Remove from outbox
      await removeOp(op.opId);
      result.synced += 1;
      continue;
    }

    let errorData: { error?: string; message?: string } = {};
    try {
      errorData = (await res.json()) as { error?: string; message?: string };
    } catch {
      // Non-JSON response
    }

    const errCode = errorData.error || `http_${res.status}`;

    if (res.status === 401 || errCode === "unauthorized") {
      // Session claimed elsewhere or expired: KEEP the op in outbox!
      await updateOp(op.opId, {
        status: "failed",
        lastError: "unauthorized",
      });
      result.failed += 1;
      result.unauthorized = true;
      // Stop loop so user can rejoin before more calls fail
      break;
    }

    if (res.status === 403 && errCode === "trip_locked") {
      // Trip was locked: mark rejected so user can review/discard
      await updateOp(op.opId, {
        status: "rejected",
        lastError: "trip_locked",
      });
      result.rejected += 1;
      continue;
    }

    if (res.status >= 400 && res.status < 500) {
      // Validation error (400) or ID conflict (409): mark rejected
      await updateOp(op.opId, {
        status: "rejected",
        lastError: errCode,
      });
      result.rejected += 1;
      continue;
    }

    // 5xx Server Error: transient, mark as failed and stop loop with backoff
    await updateOp(op.opId, {
      status: "failed",
      lastError: errCode,
    });
    result.failed += 1;
    break;
  }

  return result;
}
