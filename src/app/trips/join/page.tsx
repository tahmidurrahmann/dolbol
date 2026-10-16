import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { JoinTripForm } from "@/components/JoinTripForm";
import type { SupportedLocale } from "@/lib/format";

interface JoinTripByLinkPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function JoinTripByLinkPage({
  searchParams,
}: JoinTripByLinkPageProps) {
  const { error } = await searchParams;
  const locale = (await getLocale()) as SupportedLocale;
  const t = await getTranslations("joinByLink");
  const tErr = await getTranslations("errors");

  return (
    <section className="mx-auto max-w-xl lg:max-w-2xl space-y-5 py-4 w-full">
      <div>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          <span>←</span>
          <span>{t("backHome")}</span>
        </Link>

        <h1 className="mt-1 text-2xl font-extrabold text-[var(--color-fg)] sm:text-3xl tracking-tight">
          {t("title")}
        </h1>

        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {t("subtitle")}
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-xs flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{tErr("trip_not_found")}</span>
        </div>
      ) : null}

      <JoinTripForm
        locale={locale}
        labels={{
          inputLabel: t("inputLabel"),
          inputPlaceholder: t("inputPlaceholder"),
          submitButton: t("submitButton"),
        }}
      />
    </section>
  );
}
