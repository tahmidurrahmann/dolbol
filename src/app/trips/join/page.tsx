import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { lookupTripByLinkAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";

interface JoinTripByLinkPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function JoinTripByLinkPage({
  searchParams,
}: JoinTripByLinkPageProps) {
  const { error } = await searchParams;
  const t = await getTranslations("joinByLink");
  const tErr = await getTranslations("errors");

  return (
    <section className="mx-auto max-w-xl space-y-5 py-4 w-full">
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

      <form
        action={lookupTripByLinkAction}
        className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="tripLinkOrSlug"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {t("inputLabel")}
          </label>

          <input
            id="tripLinkOrSlug"
            name="tripLinkOrSlug"
            type="text"
            required
            placeholder={t("inputPlaceholder")}
            className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full min-h-[48px] rounded-xl text-base font-bold shadow-md hover:shadow-lg transition-all"
        >
          🔍 {t("submitButton")}
        </Button>
      </form>
    </section>
  );
}
