import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { NewTripForm } from "@/components/NewTripForm";
import type { SupportedLocale } from "@/lib/format";

interface NewTripPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewTripPage({ searchParams }: NewTripPageProps) {
  const { error } = await searchParams;
  const locale = (await getLocale()) as SupportedLocale;
  const t = await getTranslations("createTrip");
  const tErr = await getTranslations("errors");

  const errorMessage =
    error === "invalid_pin"
      ? tErr("invalid_pin")
      : error
        ? tErr("invalid_input")
        : null;

  return (
    <section className="mx-auto max-w-2xl lg:max-w-3xl space-y-5 py-4 w-full">
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

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-xs flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <NewTripForm
        locale={locale}
        labels={{
          tripNameLabel: t("tripNameLabel"),
          tripNamePlaceholder: t("tripNamePlaceholder"),
          destinationLabel: t("destinationLabel"),
          destinationPlaceholder: t("destinationPlaceholder"),
          startDateLabel: t("startDateLabel"),
          endDateLabel: t("endDateLabel"),
          yourNameLabel: t("yourNameLabel"),
          yourNamePlaceholder: t("yourNamePlaceholder"),
          emojiLabel: t("emojiLabel"),
          pinLabel: t("pinLabel"),
          pinHint: t("pinHint"),
          submitButton: t("submitButton"),
        }}
      />
    </section>
  );
}
