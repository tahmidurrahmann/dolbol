import Link from "next/link";
import { getLocale } from "next-intl/server";
import { HeaderNav } from "@/components/HeaderNav";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { SupportedLocale } from "@/lib/format";

export async function Header() {
  const locale = (await getLocale()) as SupportedLocale;
  const isBn = locale === "bn";

  return (
    <header className="sticky top-0 z-30 w-full">
      <div className="mx-auto w-full max-w-[1208px] px-2.5 py-1.5">
        <HeaderNav>
          {/* Logo & Brand */}
          <Link
            href="/"
            className="group flex items-center gap-2 sm:gap-2.5 font-black text-gray-900 transition-colors hover:text-[var(--color-primary)]"
          >
            <span className="flex size-8 sm:size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b724f] to-emerald-700 text-base sm:text-xl text-white shadow-2xs transition-transform group-hover:scale-105 shrink-0">
              🌴
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm sm:text-lg font-black tracking-tight text-gray-900">
                {isBn ? "ট্রিপ হাব" : "Trip Hub"}
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {isBn ? "ভ্রমণ ও খরচ" : "Trip & Costs"}
              </span>
            </div>
          </Link>

          {/* Right actions: Language pill + New Trip action */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <LanguageToggle currentLocale={locale} />

            <Link
              href="/trips/new"
              className="inline-flex min-h-[34px] items-center justify-center rounded-xl bg-[#e8f5ee] border border-emerald-200/90 px-2 sm:px-3.5 py-1 text-xs font-black text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-95 transition-all"
            >
              <span>{isBn ? "নতুন ট্রিপ" : "New Trip"}</span>
            </Link>
          </div>
        </HeaderNav>
      </div>
    </header>
  );
}
