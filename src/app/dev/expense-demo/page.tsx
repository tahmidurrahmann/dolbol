import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseExplainerDemo } from "@/components/ExpenseExplainerDemo";
import { env } from "@/lib/env";

interface DevDemoPageProps {
  searchParams: Promise<{ t?: string; locale?: string }>;
}

const FREEZE_POINTS = [
  { t: "1", label: "1.0s: Typing Line 1" },
  { t: "3", label: "3.0s: Typing Line 3" },
  { t: "5", label: "5.0s: Rows Pop Up" },
  { t: "6.3", label: "6.3s: Footer & Add All" },
  { t: "7", label: "7.0s: Tap Ripple" },
  { t: "8", label: "8.0s: Daily Expenses View" },
  { t: "9.5", label: "9.5s: Hold Before Fade" },
];

export default async function DevExpenseDemoPage({
  searchParams,
}: DevDemoPageProps) {
  if (process.env.NODE_ENV === "production" || env.NODE_ENV === "production") {
    notFound();
  }

  const resolvedParams = await searchParams;
  const tParam = resolvedParams.t;
  const timeFreeze =
    tParam !== undefined && !Number.isNaN(parseFloat(tParam))
      ? parseFloat(tParam)
      : undefined;
  const locale = (resolvedParams.locale === "en" ? "en" : "bn") as "bn" | "en";

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-white p-5 shadow-xs border border-neutral-200 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <span>🎬</span>
              <span>AI Expense Explainer Demo | Beat Inspector</span>
            </h1>
            <p className="text-xs text-neutral-500">
              Dev-only tool to inspect every second of the 10-second pure CSS
              animation loop.
            </p>
          </div>

          {/* Locale Toggle */}
          <div className="flex items-center gap-1.5 rounded-xl bg-neutral-100 p-1 text-xs font-bold">
            <Link
              href={`/dev/expense-demo?${new URLSearchParams({
                ...(tParam !== undefined ? { t: tParam } : {}),
                locale: "bn",
              }).toString()}`}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                locale === "bn"
                  ? "bg-white text-emerald-900 shadow-2xs font-extrabold"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              বাংলা (BN)
            </Link>
            <Link
              href={`/dev/expense-demo?${new URLSearchParams({
                ...(tParam !== undefined ? { t: tParam } : {}),
                locale: "en",
              }).toString()}`}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                locale === "en"
                  ? "bg-white text-emerald-900 shadow-2xs font-extrabold"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              English (EN)
            </Link>
          </div>
        </div>

        {/* Freeze Point Timeline Links */}
        <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-neutral-400">Freeze at:</span>

          <Link
            href={`/dev/expense-demo?locale=${locale}`}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              timeFreeze === undefined
                ? "bg-emerald-600 text-white shadow-2xs"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            ▶ Live Loop
          </Link>

          {FREEZE_POINTS.map((pt) => {
            const isActive = tParam === pt.t;
            return (
              <Link
                key={pt.t}
                href={`/dev/expense-demo?${new URLSearchParams({
                  t: pt.t,
                  locale,
                }).toString()}`}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-600 text-white font-bold shadow-2xs"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {pt.label}
              </Link>
            );
          })}
        </div>

        {/* Current status display */}
        <div className="pt-1 text-xs font-mono text-neutral-600">
          State:{" "}
          <strong className="text-emerald-800">
            {timeFreeze !== undefined
              ? `Frozen at ${timeFreeze}s (negative delay -${timeFreeze}s, paused)`
              : "Running live continuous loop (10s duration)"}
          </strong>
        </div>
      </div>

      {/* Render Dual Viewports: 360px and 480px */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Viewport 1: 360px (mobile) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-700 flex items-center gap-2">
              <span>📱</span>
              <span>Mobile Phone View (360px)</span>
            </h2>
            <span className="text-xs font-mono text-neutral-400">w: 360px</span>
          </div>

          <div className="mx-auto w-[360px] max-w-full rounded-2xl border-2 border-dashed border-neutral-300 p-2 bg-neutral-50 shadow-inner">
            <ExpenseExplainerDemo
              locale={locale}
              mode="landing"
              timeFreeze={timeFreeze}
            />
          </div>
        </div>

        {/* Viewport 2: 480px (max-width) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-700 flex items-center gap-2">
              <span>💻</span>
              <span>Full Scene View (480px)</span>
            </h2>
            <span className="text-xs font-mono text-neutral-400">
              max-w: 480px
            </span>
          </div>

          <div className="mx-auto w-[480px] max-w-full rounded-2xl border-2 border-dashed border-neutral-300 p-2 bg-neutral-50 shadow-inner">
            <ExpenseExplainerDemo
              locale={locale}
              mode="trip"
              timeFreeze={timeFreeze}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
