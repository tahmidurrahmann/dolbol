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
    <section className="space-y-5 py-2">
      <div>
        <Link
          href="/"

          className="inline-flex min-h-[44px] items-center text-base font-medium text-[var(--color-primary)] hover:underline"
        >
          {t("backHome")}
        </Link>

        <h1 className="mt-1 text-2xl font-bold text-[var(--color-fg)]">
          {t("title")}
        </h1>

        <p className="text-base text-[var(--color-fg-muted)]">
          {t("subtitle")}
        </p>
      </div>

      {error ? (
        <div
          role="alert"

          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"
        >
          {tErr("trip_not_found")}
        </div>
      ) : null}

      <form
        action={lookupTripByLinkAction}

        className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="tripLinkOrSlug"

            className="block text-base font-semibold text-[var(--color-fg)]"
          >
            {t("inputLabel")}
          </label>

          <input
            id="tripLinkOrSlug"

            name="tripLinkOrSlug"

            type="text"

            required

            placeholder={t("inputPlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <Button type="submit" variant="primary">
          {t("submitButton")}
        </Button>
      </form>
    </section>
  );
}
