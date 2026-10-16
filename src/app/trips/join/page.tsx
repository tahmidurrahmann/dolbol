import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { JoinTripForm } from "@/components/JoinTripForm";
import type { SupportedLocale } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("joinByLink");
  return {
    title: t("title"),
    description: t("subtitle"),
    openGraph: {
      title: `${t("title")} | Trip Hub`,
      description: t("subtitle"),
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "Trip Hub",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${t("title")} | Trip Hub`,
      description: t("subtitle"),
      images: ["/og-image.png"],
    },
  };
}

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

        <p className="mt-1 text-sm text-neutral-400">
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
