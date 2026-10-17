import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ErrorMessageBanner } from "@/components/ErrorMessageBanner";
import { NewTripForm } from "@/components/NewTripForm";
import type { SupportedLocale } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("createTrip");
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

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
          <span>{t("backHome")}</span>
        </Link>

        <h1 className="mt-1 text-2xl font-extrabold text-[var(--color-fg)] sm:text-3xl tracking-tight">
          {t("title")}
        </h1>

        <p className="mt-1 text-sm text-neutral-400">{t("subtitle")}</p>
      </div>

      {errorMessage ? (
        <ErrorMessageBanner message={errorMessage} />
      ) : null}

      <NewTripForm
        locale={locale}
        labels={{
          tripNameLabel: t("tripNameLabel"),
          tripNamePlaceholder: t("tripNamePlaceholder"),
          yourNameLabel: t("yourNameLabel"),
          yourNamePlaceholder: t("yourNamePlaceholder"),
          friendsNamesLabel: t("friendsNamesLabel"),
          friendsNamesPlaceholder: t("friendsNamesPlaceholder"),
          friendsNamesHint: t("friendsNamesHint"),
          moreDetailsToggle: t("moreDetailsToggle"),
          destinationLabel: t("destinationLabel"),
          destinationPlaceholder: t("destinationPlaceholder"),
          startDateLabel: t("startDateLabel"),
          endDateLabel: t("endDateLabel"),
          submitButton: t("submitButton"),
        }}
      />
    </section>
  );
}
