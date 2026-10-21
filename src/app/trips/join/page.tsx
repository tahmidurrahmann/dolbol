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
  const locale = (await getLocale()) as SupportedLocale;
  const isBn = locale === "bn";
  const tApp = await getTranslations({ locale, namespace: "app" });
  const brandName = tApp("name");
  const t = await getTranslations({ locale, namespace: "seo" });
  const titleCore = t("joinTripFallbackTitle");
  const fullTitle = `${titleCore} | ${brandName}`;
  const description = t("joinTripDescBase");
  const ogImageUrl = getSiteUrl("/og/og-invite-v2.png").toString();

  return {
    title: {
      absolute: fullTitle,
    },
    description,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      type: "website",
      siteName: brandName,
      title: fullTitle,
      description,
      url: getSiteUrl("/trips/join").toString(),
      locale: isBn ? "bn_BD" : "en_US",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: brandName,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
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
