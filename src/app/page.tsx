import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("app");
  const locale = await getLocale();
  const bn = locale === "bn";

  // Whole-taka formatter, Bangla digits when locale is bn
  const fmt = new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", {
    maximumFractionDigits: 0,
  });
  const taka = (n: number) => `৳${fmt.format(n)}`;

  // Example data. 4 friends, 18,000 total, 4,500 each.
  // Paid: Rahim 12,000 / Nusrat 3,200 / Tanvir 2,800 / Mim 0
  const people = {
    rahim: bn ? "রহিম" : "Rahim",
    nusrat: bn ? "নুসরাত" : "Nusrat",
    tanvir: bn ? "তানভীর" : "Tanvir",
    mim: bn ? "মিম" : "Mim",
  };

  const settlements = [
    { from: people.mim, to: people.rahim, amount: 4500 },
    { from: people.tanvir, to: people.rahim, amount: 1700 },
    { from: people.nusrat, to: people.rahim, amount: 1300 },
  ];

  const steps = [
    {
      title: bn ? "ট্রিপ খুলুন" : "Create a trip",
      body: bn
        ? "নাম আর বন্ধুদের নাম দিন। কোনো একাউন্ট লাগবে না।"
        : "Add a name and your friends. No account needed.",
    },
    {
      title: bn ? "লিংক শেয়ার করুন" : "Share the link",
      body: bn
        ? "গ্রুপে লিংক পাঠান। যে খুলবে সে-ই ট্রিপে ঢুকে যাবে।"
        : "Send it to the group chat. Anyone who opens it is in.",
    },
    {
      title: bn ? "খরচ লিখুন, হিসাব দেখুন" : "Add costs, see who pays whom",
      body: bn
        ? "খরচ লিখলেই কে কাকে কত দেবে, সেটা সাথে সাথে দেখা যায়।"
        : "Every cost updates the final settle-up straight away.",
    },
  ];

  const extras = [
    {
      title: bn ? "বাংলা ও বাংলিশে লিখুন" : "Type costs in Bangla or Banglish",
      body: bn
        ? "মেসেজ যেভাবে লেখেন সেভাবেই লিখুন, এআই খরচের এন্ট্রি বানিয়ে দেবে।"
        : "Write it like a text message. AI turns it into a cost entry.",
    },
    {
      title: bn ? "শুধু পূর্ণ টাকা" : "Whole taka only",
      body: bn
        ? "পয়সা বা ভগ্নাংশ নেই। ভাগ করলেও অঙ্কটা পরিষ্কার থাকে।"
        : "No paisa, no fractions. Every share is a clean number.",
    },
    {
      title: bn ? "গন্তব্য ভোট" : "Vote on where to go",
      body: bn
        ? "সবাই ভোট দিন, সবচেয়ে বেশি ভোট পাওয়া জায়গাটাই ঠিক হবে।"
        : "Everyone votes, the most-voted place wins.",
    },
    {
      title: bn ? "দিনভিত্তিক সূচি" : "Day-by-day plan",
      body: bn
        ? "প্রতিদিনের কর্মসূচি এক জায়গায় রাখুন, সবাই একই পরিকল্পনা দেখবে।"
        : "Keep each day's plan in one place so nobody asks twice.",
    },
  ];

  const headingClass = bn ? "leading-[1.35]" : "leading-[1.08] tracking-tight";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-14 py-6 sm:gap-20 sm:py-10">
      {/* HERO */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div className="flex flex-col items-start gap-6">
          <p className="text-sm font-semibold text-[var(--color-primary)]">
            {t("name")}
          </p>

          <h1
            className={`text-4xl font-extrabold text-[var(--color-fg)] sm:text-5xl ${headingClass}`}
          >
            {bn
              ? "ট্যুরের খরচ ভাগ করুন, ঝগড়া ছাড়াই।"
              : "Split trip costs with friends. Skip the arguments."}
          </h1>

          <p className="max-w-md text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
            {t("tagline")}
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/trips/new"
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-[var(--color-primary)] px-7 text-base font-bold text-white shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              {t("createTrip")}
            </Link>
            <Link
              href="/trips/join"
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 text-base font-bold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              {t("joinTrip")}
            </Link>
          </div>

          <p className="text-sm text-[var(--color-fg-muted)]">
            {bn
              ? "লগইন লাগবে না। শুধু লিংক শেয়ার করুন।"
              : "No login. Just share the link."}
          </p>
        </div>

        {/* LIVE EXAMPLE: shows the product instead of describing it */}
        <div
          role="img"
          aria-label={
            bn
              ? "উদাহরণ: একটি মেসেজ থেকে খরচের এন্ট্রি এবং কে কাকে কত দেবে তার হিসাব"
              : "Example: a typed message becomes a cost entry, then a settle-up showing who pays whom"
          }
          className="w-full rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6"
        >
          <p className="text-xs font-medium text-[var(--color-fg-muted)]">
            {bn
              ? "যেভাবে মেসেজ করেন সেভাবেই লিখুন"
              : "Type it like a text message"}
          </p>

          <div className="mt-2 w-fit max-w-full rounded-2xl rounded-bl-md bg-[var(--color-surface-muted)] px-4 py-3 text-sm font-medium text-[var(--color-fg)]">
            {bn
              ? "হোটেল ১২০০০ রহিম দিছে, সবাই ভাগ"
              : "hotel 12000 rahim dilo, sobai bhag"}
          </div>

          {/* parsed entry */}
          <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-fg)]">
                {bn ? "হোটেল" : "Hotel"}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {bn
                  ? `${people.rahim} দিয়েছেন, ৪ জনে ভাগ`
                  : `Paid by ${people.rahim}, split 4 ways`}
              </p>
            </div>
            <p className="text-base font-extrabold tabular-nums text-[var(--color-fg)]">
              {taka(12000)}
            </p>
          </div>

          {/* settle up */}
          <div className="mt-6 border-t border-[var(--color-border)] pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold text-[var(--color-fg)]">
                {bn ? "কে কাকে দেবে" : "Who pays whom"}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {bn
                  ? `মোট ${taka(18000)}, জনপ্রতি ${taka(4500)}`
                  : `${taka(18000)} total, ${taka(4500)} each`}
              </p>
            </div>

            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {settlements.map((s) => (
                <li
                  key={s.from}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-sm font-bold text-[var(--color-fg)]"
                    >
                      {s.from.charAt(0)}
                    </span>
                    <p className="truncate text-sm text-[var(--color-fg)]">
                      {bn ? (
                        <>
                          <strong>{s.from}</strong> দেবে <strong>{s.to}</strong>{" "}
                          কে
                        </>
                      ) : (
                        <>
                          <strong>{s.from}</strong> pays <strong>{s.to}</strong>
                        </>
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-[var(--color-primary)]">
                    {taka(s.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: a real sequence, so numbering is justified */}
      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2
          id="how-heading"
          className="text-2xl font-bold text-[var(--color-fg)] sm:text-3xl"
        >
          {bn ? "তিন ধাপে শেষ" : "Three steps, done"}
        </h2>

        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:flex-col"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white"
              >
                {bn ? ["১", "২", "৩"][i] : i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-[var(--color-fg)]">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* EXTRAS: plain list, not another wall of cards */}
      <section aria-labelledby="extras-heading" className="flex flex-col gap-4">
        <h2
          id="extras-heading"
          className="text-2xl font-bold text-[var(--color-fg)] sm:text-3xl"
        >
          {bn ? "প্রতিটি ট্রিপে যা পাবেন" : "In every trip"}
        </h2>

        <dl className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          {extras.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-8"
            >
              <dt className="text-sm font-bold text-[var(--color-fg)] sm:w-64 sm:shrink-0">
                {item.title}
              </dt>
              <dd className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {item.body}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* CLOSING CTA: so users who scrolled don't have to scroll back up */}
      <section className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-[var(--color-primary)] p-6 text-white sm:flex-row sm:items-center sm:p-8">
        <p className="max-w-md text-xl font-bold leading-snug sm:text-2xl">
          {bn
            ? "পরের ট্যুরের হিসাব এখনই শুরু করুন।"
            : "Start the next trip's accounts now."}
        </p>
        <Link
          href="/trips/new"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-white px-7 text-base font-bold text-[var(--color-primary)] transition-[filter,transform] hover:brightness-95 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
        >
          {t("createTrip")}
        </Link>
      </section>
    </div>
  );
}
