"use client";

import { useState } from "react";
import { clearTripOfflineData } from "@/lib/offline";
import { useOutbox } from "@/lib/use-outbox";
import { toBanglaDigits, type SupportedLocale } from "@/lib/format";

export interface ClearTripOfflineDataLabels {
  linkText?: string;
  confirmDesc?: string;
  clearButton?: string;
  clearingButton?: string;
  cancelButton?: string;
  unsyncedWarning?: string;
  syncNowButton?: string;
  syncingButton?: string;
  clearAnywayButton?: string;
  secondConfirmTitle?: string;
  successMessage?: string;
}

export interface ClearTripOfflineDataLinkProps {
  tripSlug: string;
  locale?: SupportedLocale;
  labels?: ClearTripOfflineDataLabels;
}

type Step = "idle" | "confirm" | "unsynced_warning" | "second_confirm" | "clearing" | "success";

export function ClearTripOfflineDataLink({
  tripSlug,
  locale = "bn",
  labels,
}: ClearTripOfflineDataLinkProps) {
  const [step, setStep] = useState<Step>("idle");
  const { pendingCount, isSyncing, triggerSync } = useOutbox(tripSlug);

  const isBn = locale === "bn";

  const linkText =
    labels?.linkText ??
    (isBn ? "এই ডিভাইস থেকে ট্রিপের ডেটা মুছুন" : "Clear this trip's data from this device");

  const confirmDesc =
    labels?.confirmDesc ??
    (isBn
      ? "এই ডিভাইসে সংরক্ষিত এই ট্রিপের কপি মুছে যাবে, ইন্টারনেট ছাড়া আর খুলবে না। ট্রিপটি মুছে যাবে না, লিংকে আবার ঢুকলে পাবেন।"
      : "The copy of this trip saved on this device will be removed and won't open offline. The trip itself is not deleted; you can open it again from the link.");

  const clearBtn = labels?.clearButton ?? (isBn ? "মুছুন" : "Clear");
  const clearingBtn =
    labels?.clearingButton ?? (isBn ? "মুছে ফেলা হচ্ছে..." : "Clearing...");
  const cancelBtn = labels?.cancelButton ?? (isBn ? "বাতিল" : "Cancel");

  const countStr = isBn ? toBanglaDigits(pendingCount) : String(pendingCount);
  const unsyncedWarning =
    labels?.unsyncedWarning?.replaceAll("{count}", countStr) ??
    (isBn
      ? `${countStr}টি খরচ এখনো সিঙ্ক হয়নি, মুছলে হারিয়ে যাবে`
      : `${countStr} expense(s) are not synced yet and will be lost`);

  const syncNowBtn = labels?.syncNowButton ?? (isBn ? "এখনই সিঙ্ক করুন" : "Sync now");
  const syncingBtn = labels?.syncingButton ?? (isBn ? "সিঙ্ক হচ্ছে..." : "Syncing...");
  const clearAnywayBtn = labels?.clearAnywayButton ?? (isBn ? "তবুও মুছুন" : "Clear anyway");

  const secondConfirmTitle =
    labels?.secondConfirmTitle ??
    (isBn
      ? "অসিঙ্কড খরচগুলো স্থায়ীভাবে হারিয়ে যাবে। আপনি কি নিশ্চিতভাবে এই ট্রিপের ডেটা মুছতে চান?"
      : "Unsynced expenses will be permanently lost. Are you sure you want to clear this trip's data?");

  const successMessage =
    labels?.successMessage ??
    (isBn
      ? "✓ এই ডিভাইসে সংরক্ষিত ট্রিপের কপি মুছে ফেলা হয়েছে"
      : "✓ This trip's offline data was cleared from this device");

  const handleInitialClick = () => {
    if (pendingCount > 0) {
      setStep("unsynced_warning");
    } else {
      setStep("confirm");
    }
  };

  const handleExecuteClear = async () => {
    setStep("clearing");
    try {
      await clearTripOfflineData(tripSlug);
      setStep("success");
      setTimeout(() => {
        setStep("idle");
      }, 4000);
    } catch (err) {
      console.error("Failed to clear trip offline data:", err);
      setStep("idle");
    }
  };

  const handleSyncNow = async () => {
    await triggerSync();
  };

  // State 1: Success message
  if (step === "success") {
    return (
      <div className="w-full flex justify-center py-2" role="status" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-2xs">
          {successMessage}
        </span>
      </div>
    );
  }

  // State 2: Explicit Second Confirmation (when user clicked "Clear anyway" with unsynced outbox items)
  if (step === "second_confirm") {
    return (
      <div
        className="w-full max-w-md rounded-2xl border border-rose-300 bg-rose-50/95 p-4 text-xs text-neutral-800 shadow-sm space-y-3"
        role="alertdialog"
        aria-labelledby="second-confirm-title"
      >
        <p id="second-confirm-title" className="font-bold text-rose-900 leading-relaxed">
          ⚠️ {secondConfirmTitle}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
          >
            {cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleExecuteClear}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 active:scale-95 transition-all cursor-pointer shadow-2xs"
          >
            {clearAnywayBtn}
          </button>
        </div>
      </div>
    );
  }

  // State 3: Unsynced Warning (when trip has unsynced items)
  if (step === "unsynced_warning") {
    return (
      <div
        className="w-full max-w-md rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-xs text-neutral-800 shadow-sm space-y-3"
        role="alertdialog"
        aria-labelledby="unsynced-warning-title"
      >
        <div className="space-y-1">
          <p id="unsynced-warning-title" className="font-bold text-amber-950">
            ⚠️ {unsyncedWarning}
          </p>
          <p className="text-neutral-600 leading-relaxed">{confirmDesc}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
          >
            {cancelBtn}
          </button>

          <button
            type="button"
            onClick={() => setStep("second_confirm")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-95 transition-all cursor-pointer"
          >
            {clearAnywayBtn}
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={handleSyncNow}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 active:scale-95 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <span>{isSyncing ? "⏳" : "🔄"}</span>
            <span>{isSyncing ? syncingBtn : syncNowBtn}</span>
          </button>
        </div>
      </div>
    );
  }

  // State 4: Standard Inline Confirmation (when 0 unsynced items)
  if (step === "confirm" || step === "clearing") {
    return (
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-4 text-xs text-neutral-700 shadow-sm space-y-3"
        role="dialog"
        aria-labelledby="clear-offline-confirm-desc"
      >
        <p id="clear-offline-confirm-desc" className="text-neutral-600 leading-relaxed">
          {confirmDesc}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={step === "clearing"}
            onClick={() => setStep("idle")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {cancelBtn}
          </button>

          <button
            type="button"
            disabled={step === "clearing"}
            onClick={handleExecuteClear}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 active:scale-95 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {step === "clearing" ? clearingBtn : clearBtn}
          </button>
        </div>
      </div>
    );
  }

  // State 5: Idle (small, muted text link with min 44px tap target)
  return (
    <div className="w-full flex justify-center py-2">
      <button
        type="button"
        onClick={handleInitialClick}
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-2 text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-4 transition-colors cursor-pointer"
      >
        {linkText}
      </button>
    </div>
  );
}
