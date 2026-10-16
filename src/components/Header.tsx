import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/Container";
import { LanguageToggle } from "@/components/LanguageToggle";

export async function Header() {
  const t = await getTranslations("app");

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-xs">
      <Container className="flex min-h-[60px] items-center justify-between gap-3 py-2">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-lg font-bold tracking-tight text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {t("name")}
        </Link>
        <LanguageToggle />
      </Container>
    </header>
  );
}
