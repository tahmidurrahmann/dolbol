import type { Metadata } from "next";
import Link from "next/link";
import { OfflineReloadButton } from "@/components/OfflineReloadButton";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "ইন্টারনেট নেই | Offline",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <div className="max-w-md space-y-5 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8 shadow-xs">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl">
          📡
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black text-[var(--color-fg)]">
            ইন্টারনেট সংযোগ নেই
          </h1>
          <p className="text-sm font-semibold text-neutral-500">
            No Internet Connection
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-amber-50/80 border border-amber-200/80 p-4 text-left text-xs sm:text-sm text-amber-950">
          <p className="leading-relaxed">
            🇧🇩 <strong>বাংলা:</strong> এই ট্রিপটি আগে এই ডিভাইসে ভিজিট করা হয়নি।
            প্রথমবার ট্রিপের তথ্য লোড করতে এবং অফলাইনে সংরক্ষণের জন্য ইন্টারনেট
            সংযোগ প্রয়োজন।
          </p>
          <div className="border-t border-amber-200/60 pt-2.5">
            <p className="text-xs text-amber-900 leading-relaxed">
              🇬🇧 <strong>English:</strong> This trip has not been opened on this
              device yet. An internet connection is required for the first load
              before it can be viewed offline.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-2xs"
          >
            হোমপেজে যান
          </Link>
          <OfflineReloadButton />
        </div>
      </div>
    </div>
  );
}
