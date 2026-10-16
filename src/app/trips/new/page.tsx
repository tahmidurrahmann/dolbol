import Link from "next/link";

import { getTranslations } from "next-intl/server";

import { createTripAction } from "@/app/trips/actions";

import { Button } from "@/components/Button";

import { MEMBER_EMOJIS } from "@/lib/trips";

interface NewTripPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewTripPage({ searchParams }: NewTripPageProps) {
  const { error } = await searchParams;

  const t = await getTranslations("createTrip");

  const tErr = await getTranslations("errors");

  const errorMessage =
    error === "invalid_pin"
      ? tErr("invalid_pin")
      : error
        ? tErr("invalid_input")
        : null;

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

      {errorMessage ? (
        <div
          role="alert"

          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"
        >
          {errorMessage}
        </div>
      ) : null}

      <form
        action={createTripAction}

        className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="name"

            className="block text-base font-semibold text-[var(--color-fg)]"
          >
            {t("tripNameLabel")}
          </label>

          <input
            id="name"

            name="name"

            type="text"

            required

            minLength={2}

            maxLength={80}

            placeholder={t("tripNamePlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="destination"

            className="block text-base font-semibold text-[var(--color-fg)]"
          >
            {t("destinationLabel")}
          </label>

          <input
            id="destination"

            name="destination"

            type="text"

            maxLength={80}

            placeholder={t("destinationPlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="startDate"

              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {t("startDateLabel")}
            </label>

            <input
              id="startDate"

              name="startDate"

              type="date"

              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="endDate"

              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {t("endDateLabel")}
            </label>

            <input
              id="endDate"

              name="endDate"

              type="date"

              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
        </div>

        <hr className="border-[var(--color-border)]" />

        <div className="space-y-1.5">
          <label
            htmlFor="creatorName"

            className="block text-base font-semibold text-[var(--color-fg)]"
          >
            {t("yourNameLabel")}
          </label>

          <input
            id="creatorName"

            name="creatorName"

            type="text"

            required

            minLength={1}

            maxLength={40}

            placeholder={t("yourNamePlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-base font-semibold text-[var(--color-fg)]">
            {t("emojiLabel")}
          </legend>

          <div className="grid grid-cols-6 gap-2 pt-1">
            {MEMBER_EMOJIS.map((emoji, index) => (
              <label
                key={emoji}

                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xl has-[:checked]:border-2 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-white"
              >
                <input
                  type="radio"

                  name="creatorEmoji"

                  value={emoji}

                  defaultChecked={index === 0}

                  className="sr-only"
                />

                <span>{emoji}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1">
          <label
            htmlFor="creatorPin"

            className="block text-base font-semibold text-[var(--color-fg)]"
          >
            {t("pinLabel")}
          </label>

          <input
            id="creatorPin"

            name="creatorPin"

            type="password"

            inputMode="numeric"

            maxLength={6}

            placeholder="১২৩৪ / 1234"

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />

          <p className="text-sm text-[var(--color-fg-muted)]">{t("pinHint")}</p>
        </div>

        <Button type="submit" variant="primary">
          {t("submitButton")}
        </Button>
      </form>
    </section>
  );
}
