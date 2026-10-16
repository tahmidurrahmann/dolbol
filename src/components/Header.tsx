import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/Container";
import { LanguageToggle } from "@/components/LanguageToggle";

export async function Header() {
  const t = await getTranslations("app");

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md shadow-xs">
      <Container className="flex min-h-[64px] items-center justify-between gap-3 py-2">
        <Link
          href="/"
          className="group inline-flex min-h-[44px] items-center gap-2.5 text-lg font-bold tracking-tight text-[var(--color-fg)] transition-colors hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-emerald-700 text-lg shadow-sm transition-transform group-hover:scale-105">
            🌴
          </span>
          <div className="flex flex-col">
            <span className="font-extrabold text-[var(--color-primary)] tracking-tight">
              {t("name")}
            </span>
            <span className="text-[10px] font-medium text-[var(--color-fg-muted)] tracking-wider uppercase">
              Trip Hub
            </span>
          </div>
        </Link>
        <LanguageToggle />
      </Container>
    </header>
  );
}
