"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to client console for easier debugging
    console.error("Trip Hub Application Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-[var(--color-fg)]">
          কিছু একটা সমস্যা হয়েছে (Something went wrong)
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {error.message && !error.message.includes("digest")
            ? error.message
            : "সার্ভারে একটি ত্রুটি ঘটেছে। দয়া করে আবার চেষ্টা করুন। (A server error occurred. Please try again.)"}
        </p>

        {error.digest ? (
          <p className="rounded bg-[var(--color-surface-muted)] px-2 py-1 font-mono text-xs text-[var(--color-fg-muted)]">
            Digest: {error.digest}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" variant="primary" onClick={() => reset()}>
            আবার চেষ্টা করুন (Try again)
          </Button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            হোমে ফিরে যান (Back to Home)
          </Link>
        </div>
      </div>
    </div>
  );
}
