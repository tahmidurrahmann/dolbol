"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button } from "@/components/Button";
import { BRAND } from "@/config/brand";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const bn = useLocale() === "bn";

  useEffect(() => {
    console.error(`${BRAND.name.en} Application Error:`, error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div
        role="alert"
        className="flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm sm:p-8"
      >
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-red-500/10 text-red-600"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>

        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-[var(--color-fg)]">
            {bn ? "কিছু একটা ঠিকমতো হয়নি" : "Something went wrong"}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {bn
              ? "আপনার ট্রিপের তথ্য ঠিক আছে। আবার চেষ্টা করুন, তাতেও না হলে কিছুক্ষণ পরে আসুন।"
              : "Your trip data is safe. Try again, and if it keeps happening, come back in a few minutes."}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button type="button" variant="primary" onClick={() => reset()}>
            {bn ? "আবার চেষ্টা করুন" : "Try again"}
          </Button>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl text-sm font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {bn ? "হোমে ফিরে যান" : "Back to home"}
          </Link>
        </div>

        {/* Raw messages only in dev; users get a short reference code instead */}
        {isDev && error.message ? (
          <p className="w-full break-words rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-left font-mono text-xs text-[var(--color-fg-muted)]">
            {error.message}
          </p>
        ) : null}

        {error.digest ? (
          <p className="text-xs text-[var(--color-fg-muted)]">
            {bn ? "রেফারেন্স কোড" : "Reference code"}:{" "}
            <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
