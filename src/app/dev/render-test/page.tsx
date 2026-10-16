import Image from "next/image";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";

const BANGLA_SAMPLES: readonly string[] = [
  "সুন্দরবন ভ্রমণ — মোট খরচ ৳১২,৫০০",
  "কক্সবাজার",
  "শ্রীমঙ্গল",
  "দ্বিতীয় দিন",
];

const ENGLISH_SAMPLE =
  "Sundarbans Trip — Total Cost ৳12,500 (Cox's Bazar, Sreemangal, Day 2)";

export default function RenderTestPage() {
  if (env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <section className="space-y-6 py-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-[var(--color-fg)]">
          Bangla Rendering Test (Dev Only)
        </h1>
        <p className="text-base text-[var(--color-fg-muted)]">
          Compares browser HTML shaping against <code>next/og</code> PNG output.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-base font-semibold text-[var(--color-primary)]">
          1. Browser HTML Render (Noto Sans Bengali)
        </h2>
        <ul className="space-y-2 text-lg">
          {BANGLA_SAMPLES.map((sample) => (
            <li key={sample} className="font-medium">
              {sample}
            </li>
          ))}
        </ul>
        <p className="border-t border-[var(--color-border)] pt-2 text-base text-[var(--color-fg-muted)]">
          {ENGLISH_SAMPLE}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-base font-semibold text-[var(--color-primary)]">
          2. <code>/api/dev/render-image</code> (<code>next/og</code> PNG)
        </h2>
        <Image
          src="/api/dev/render-image"
          alt="Bangla OG Image Render Test"
          width={600}
          height={300}
          unoptimized
          className="h-auto w-full rounded-lg border border-[var(--color-border)]"
        />
      </div>
    </section>
  );
}
