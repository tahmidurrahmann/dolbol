"use client";

export function OfflineReloadButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }}
      className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-[var(--color-primary)] px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[var(--color-primary-hover)] transition-all shadow-xs cursor-pointer active:scale-95"
    >
      <span aria-hidden="true">🔄</span>
      <span>আবার চেষ্টা করুন</span>
    </button>
  );
}
