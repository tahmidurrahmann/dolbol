import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BackToTripBar } from "@/components/BackToTripBar";
import { ErrorMessageBanner } from "@/components/ErrorMessageBanner";
import { JoinTripForm } from "@/components/JoinTripForm";
import { BRAND } from "@/config/brand";
import type { SupportedLocale } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("joinByLink");
  const locale = (await getLocale()) as SupportedLocale;
  const brandName = BRAND.name[locale === "bn" ? "bn" : "en"];
  const ogImageUrl = getSiteUrl("/og-image.png").toString();

  return {
    title: t("title"),
    description: t("subtitle"),
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: `${t("title")} | ${brandName}`,
      description: t("subtitle"),
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: brandName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${t("title")} | ${brandName}`,
      description: t("subtitle"),
      images: [ogImageUrl],
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
      <BackToTripBar locale={locale} />

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

      {error ? <ErrorMessageBanner message={tErr("trip_not_found")} /> : null}

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
