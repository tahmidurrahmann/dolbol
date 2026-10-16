import Link from "next/link";

import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("app");

  return (
    <section className="my-auto flex flex-col justify-center gap-6 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg)]">
          {t("name")}
        </h1>

        <p className="text-base text-[var(--color-fg-muted)]">{t("tagline")}</p>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <Link
          href="/trips/new"

          className="inline-flex min-h-[48px] min-w-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-semibold text-[var(--color-primary-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {t("createTrip")}
        </Link>

        <Link
          href="/trips/join"

          className="inline-flex min-h-[48px] min-w-[44px] w-full items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-base font-semibold text-[var(--color-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {t("joinTrip")}
        </Link>
      </div>
    </section>
  );
}
