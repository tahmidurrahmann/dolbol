import { getTranslations } from "next-intl/server";
import { Button } from "@/components/Button";

export default async function HomePage() {
  const t = await getTranslations("app");

  return (
    <section className="my-auto flex flex-col justify-center gap-6 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg)]">
          {t("name")}
        </h1>
        <p className="text-base text-[var(--color-fg-muted)]">
          {t("tagline")}
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <Button variant="primary" disabled aria-disabled="true">
          <span>{t("createTrip")}</span>
          <span className="ml-2 rounded-md bg-white/20 px-2 py-0.5 text-sm font-normal">
            {t("comingSoon")}
          </span>
        </Button>

        <Button variant="secondary" disabled aria-disabled="true">
          <span>{t("joinTrip")}</span>
          <span className="ml-2 rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-sm font-normal text-[var(--color-fg-muted)]">
            {t("comingSoon")}
          </span>
        </Button>
      </div>
    </section>
  );
}
