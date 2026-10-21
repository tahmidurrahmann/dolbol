import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { BRAND } from "@/config/brand";
import { PublicSummaryShareCard } from "@/components/PublicSummaryShareCard";
import { db } from "@/lib/db";
import { type SupportedLocale, toBanglaDigits } from "@/lib/format";
import { buildPublicTripSummary } from "@/lib/share-and-export";
import { getSiteUrl } from "@/lib/site-url";
import { sanitizeTripTitleForMeta } from "@/lib/sanitize-meta";

interface PublicSummaryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PublicSummaryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const trip = await db.trip.findUnique({
    where: { slug },
    select: { name: true, destination: true },
  });

  const locale = (await getLocale()) as SupportedLocale;
  const isBn = locale === "bn";
  const tApp = await getTranslations({ locale, namespace: "app" });
  const brandName = tApp("name");
  const t = await getTranslations({ locale, namespace: "seo" });
  const ogImageUrl = getSiteUrl("/og/og-home-v1.png").toString();

  if (!trip) {
    const fallbackTitle = `${t("summaryFallbackTitle")} | ${brandName}`;
    const description = t("summaryDesc");
    return {
      title: {
        absolute: fallbackTitle,
      },
      description,
      robots: {
        index: false,
        follow: false,
      },
      openGraph: {
        type: "website",
        siteName: brandName,
        title: fallbackTitle,
        description,
        url: getSiteUrl(`/trips/${slug}/summary`).toString(),
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
        title: fallbackTitle,
        description,
        images: [ogImageUrl],
      },
    };
  }

  const sanitizedName = sanitizeTripTitleForMeta(
    trip.name,
    40,
    t("summaryFallbackTitle"),
    locale,
  );
  const titleCore = t("summaryTitle", { tripName: sanitizedName });
  const fullTitle = `${titleCore} | ${brandName}`;
  const description = t("summaryDesc");

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
      url: getSiteUrl(`/trips/${slug}/summary`).toString(),
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

export default async function PublicTripSummaryPage({
  params,
}: PublicSummaryPageProps) {
  const { slug } = await params;
  const locale = (await getLocale()) as SupportedLocale;
  const tShare = await getTranslations("shareExport");
  const tTrip = await getTranslations("tripPage");
  const tPlan = await getTranslations("planning");

  // Strictly query ONLY non-financial trip planning data (never expenses or settlements)
  const trip = await db.trip.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
      options: {
        orderBy: { createdAt: "asc" },
      },
      votes: true,
      itinerary: {
        orderBy: [
          { dayNumber: "asc" },
          { position: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!trip) {
    redirect("/trips/join");
  }

  const summary = buildPublicTripSummary({
    slug: trip.slug,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    members: trip.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      emoji: m.emoji,
      isGuest: m.isGuest,
    })),
    options: trip.options,
    votes: trip.votes,
    itinerary: trip.itinerary,
    locale,
  });

  const memberCountLabel =
    locale === "bn"
      ? toBanglaDigits(summary.memberCount)
      : String(summary.memberCount);

  return (
    <section className="mx-auto max-w-[1208px] space-y-5 py-4 w-full">
      {/* Public Read-Only Banner */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)]/40 px-4 py-3 text-xs sm:text-sm font-bold text-[var(--color-primary)] shadow-2xs">
        <span className="flex items-center gap-1.5">
          <span>🌐</span>
          <span>{tShare("publicSummaryBadge")}</span>
        </span>
        <Link
          href={`/trips/${summary.slug}`}
          className="underline hover:opacity-80 transition-opacity"
        >
          {tShare("openFullTripHub")} →
        </Link>
      </div>

      <div className="space-y-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0 lg:items-start">
        {/* Left Column (Overview, Share Image, CTA) */}
        <div className="space-y-5 lg:col-span-5">
          {/* Trip Overview Card */}
          <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-fg)] tracking-tight">
                {summary.name}
              </h1>
            </div>

            {summary.destination ? (
              <p className="text-base font-bold text-[var(--color-primary)] flex items-center gap-1.5">
                <span>📍</span>
                <span>
                  {tTrip("destinationPrefix")} {summary.destination}
                </span>
              </p>
            ) : summary.topVotedDestination ? (
              <p className="text-base font-bold text-[var(--color-primary)] flex items-center gap-1.5">
                <span>🏆</span>
                <span>
                  {tPlan("topPickBadge")}: {summary.topVotedDestination}
                </span>
              </p>
            ) : null}

            {summary.dateRangeLabel ? (
              <p className="text-sm font-medium text-[var(--color-fg-muted)] flex items-center gap-1.5">
                <span>🗓️</span>
                <span>{summary.dateRangeLabel}</span>
              </p>
            ) : null}
          </div>

          {/* Shareable Summary Image Card (Rendered via browser with full native Bangla font shaping + html-to-image PNG export) */}
          <PublicSummaryShareCard
            slug={summary.slug}
            tripName={summary.name}
            destination={summary.destination}
            topVotedDestination={summary.topVotedDestination}
            dateRangeLabel={summary.dateRangeLabel}
            memberCount={summary.memberCount}
            members={summary.members}
            itineraryDays={summary.itineraryDays}
            locale={locale}
            labels={{
              heading: tShare("shareImageHeading"),
              downloadButton: tShare("downloadShareImageButton"),
            }}
          />

          {/* CTA to join / open full trip */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center shadow-xs">
            <p className="mb-3 text-xs sm:text-sm text-[var(--color-fg-muted)]">
              {tShare("privacyNotice")}
            </p>
            <Link
              href={`/trips/${summary.slug}`}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-bold text-white shadow-md hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
            >
              {tShare("openFullTripHub")}
            </Link>
          </div>
        </div>

        {/* Right Column (Members, Itinerary) */}
        <div className="space-y-5 lg:col-span-7">
          {/* Members List (No PIN or money details) */}
          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
            <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
              <span>👥</span>
              <span>
                {tTrip("membersHeading")} ({memberCountLabel})
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {summary.members.map((m) => (
                <span
                  key={m.displayName}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-bold text-[var(--color-fg)] shadow-2xs"
                >
                  <span>{m.emoji}</span>
                  <span>{m.displayName}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Day-by-Day Itinerary */}
          <div className="space-y-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
            <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
              <span>📅</span>
              <span>{tPlan("itineraryTitle")}</span>
            </h2>

            {summary.itineraryDays.length === 0 ? (
              <p className="rounded-xl bg-white border border-[var(--color-border)] px-4 py-3 text-center text-sm text-[var(--color-fg-muted)] shadow-2xs">
                {tPlan("noItineraryYet")}
              </p>
            ) : (
              <div className="space-y-4">
                {summary.itineraryDays.map((group) => (
                  <div
                    key={group.dayNumber}
                    className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
                  >
                    <h3 className="border-b border-[var(--color-border)] pb-1.5 text-base font-bold text-[var(--color-primary)]">
                      {group.label}
                    </h3>
                    <ol className="space-y-2">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-2xs"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {item.time ? (
                              <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-primary)]">
                                🕘 {item.time}
                              </span>
                            ) : null}
                            <span className="font-bold text-[var(--color-fg)]">
                              {item.title}
                            </span>
                          </div>
                          {item.notes ? (
                            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                              {item.notes}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
