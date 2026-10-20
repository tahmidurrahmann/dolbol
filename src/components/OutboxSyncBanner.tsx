"use client";

import Link from "next/link";
import { useOutbox } from "@/lib/use-outbox";
import { toBanglaDigits, type SupportedLocale } from "@/lib/format";

export interface OutboxSyncBannerProps {
  slug: string;
  locale?: SupportedLocale;
}

export function OutboxSyncBanner({
  slug,
  locale = "bn",
}: OutboxSyncBannerProps) {
  const { pendingCount, rejectedOps, isSyncing, unauthorizedError, triggerSync } =
    useOutbox(slug);

  const isBn = locale === "bn";
  const countStr = isBn ? toBanglaDigits(pendingCount) : String(pendingCount);

  if (pendingCount === 0 && rejectedOps.length === 0 && !unauthorizedError) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2 rounded-2xl border border-sky-300 bg-sky-50/95 p-3.5 text-xs sm:text-sm font-semibold text-sky-950 shadow-sm animate-in fade-in"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="text-base shrink-0">
            🕒
          </span>
          <span className="font-bold">
            {isBn
              ? `${countStr}টি খরচ অপেক্ষমাণ (অফলাইন আউটবক্স)`
              : `${countStr} expense(s) pending (offline outbox)`}
          </span>
          <span className="shrink-0 rounded-full bg-sky-200/90 px-2 py-0.5 text-[11px] font-extrabold text-sky-900 border border-sky-300">
            {isBn ? "অসিঙ্কড" : "Unsynced"}
          </span>
        </div>

        <button
          type="button"
          disabled={isSyncing}
          onClick={() => triggerSync()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-700 active:scale-95 transition-all cursor-pointer disabled:opacity-60 shadow-2xs"
        >
          <span aria-hidden="true">{isSyncing ? "⏳" : "🔄"}</span>
          <span>
            {isSyncing
              ? isBn
                ? "সিঙ্ক হচ্ছে..."
                : "Syncing..."
              : isBn
                ? "এখনই সিঙ্ক করুন"
                : "Sync now"}
          </span>
        </button>
      </div>

      {unauthorizedError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-100/90 border border-amber-300 p-2.5 text-xs text-amber-950">
          <span>
            ⚠️{" "}
            {isBn
              ? "সেশন শেষ হয়েছে বা অন্য ডিভাইসে খোলা হয়েছে। অপেক্ষমাণ খরচ সিঙ্ক করতে পুনরায় ট্রিপে যোগ দিন।"
              : "Session expired or claimed elsewhere. Please rejoin the trip to sync pending expenses."}
          </span>
          <Link
            href={`/trips/join?slug=${encodeURIComponent(slug)}`}
            className="font-bold text-amber-900 underline hover:text-amber-950"
          >
            {isBn ? "পুনরায় যোগ দিন →" : "Rejoin trip →"}
          </Link>
        </div>
      ) : null}

      {rejectedOps.length > 0 ? (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-2 text-xs font-medium text-rose-900">
          ⚠️{" "}
          {isBn
            ? `${toBanglaDigits(rejectedOps.length)}টি খরচ প্রত্যাখ্যাত হয়েছে। নিচের তালিকায় গিয়ে সংশোধন করুন বা মুছে ফেলুন।`
            : `${rejectedOps.length} expense(s) rejected by server. Check the list below to edit or discard.`}
        </div>
      ) : null}
    </div>
  );
}
