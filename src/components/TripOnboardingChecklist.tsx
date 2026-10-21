"use client";

import { toBanglaDigits, type SupportedLocale } from "@/lib/format";
import { InviteFriendsCard } from "@/components/InviteFriendsCard";
import {
  deriveOnboardingStepStates,
  shouldShowOnboardingChecklist,
} from "@/lib/onboarding";
import { scrollToAddExpense } from "@/lib/scroll-to-add-expense";

export interface TripOnboardingChecklistLabels {
  title: string;
  stepInvite: string;
  stepExpense: string;
  stepSettle: string;
}

interface TripOnboardingChecklistProps {
  slug: string;
  tripName: string;
  destination?: string | null;
  locale: SupportedLocale;
  joinedMembersCount: number;
  expenseCount: number;
  labels: TripOnboardingChecklistLabels;
}

export function TripOnboardingChecklist({
  slug,
  tripName,
  destination,
  locale,
  joinedMembersCount,
  expenseCount,
  labels,
}: TripOnboardingChecklistProps) {
  if (!shouldShowOnboardingChecklist(joinedMembersCount, expenseCount)) {
    return null;
  }

  const isBn = locale === "bn";
  const { isStep1Done, isStep2Done, isStep3Done, completedCount } =
    deriveOnboardingStepStates(joinedMembersCount, expenseCount);

  const num1 = isBn ? "১" : "1";
  const num2 = isBn ? "২" : "2";
  const num3 = isBn ? "৩" : "3";
  const membersCountStr = isBn
    ? toBanglaDigits(joinedMembersCount)
    : String(joinedMembersCount);
  const targetMembersStr = isBn ? "২+" : "2+";

  return (
    <div
      data-testid="onboarding-checklist-card"
      className="space-y-3.5 sm:space-y-4 rounded-3xl border-2 border-[var(--color-primary)]/30 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/40 p-3.5 min-[360px]:p-4 sm:p-5 shadow-xs"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5 sm:pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <h2 className="text-sm sm:text-base font-extrabold text-[var(--color-fg)]">
            {labels.title}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--color-primary-light)]/60 px-2.5 py-0.5 text-xs font-bold text-[var(--color-primary)]">
          {isBn
            ? `${toBanglaDigits(completedCount)}/৩ সম্পন্ন`
            : `${completedCount}/3 completed`}
        </span>
      </div>

      <div className="space-y-2.5 sm:space-y-3">
        {/* Step 1: Invite Friends (বন্ধুদের ডাকুন) */}
        <div
          data-testid="onboarding-step-1"
          className={`space-y-2.5 rounded-2xl border p-2.5 min-[360px]:p-3 sm:p-3.5 transition-all ${
            isStep1Done
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-[var(--color-border)] bg-white shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                  isStep1Done
                    ? "bg-emerald-600 text-white"
                    : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                }`}
              >
                {isStep1Done ? "✓" : num1}
              </span>
              <span
                className={`text-xs sm:text-sm font-bold ${
                  isStep1Done
                    ? "text-emerald-900 line-through decoration-emerald-600/50"
                    : "text-[var(--color-fg)]"
                }`}
              >
                {labels.stepInvite}
              </span>
              <span className="text-xs font-semibold text-neutral-500">
                ({membersCountStr}/{targetMembersStr})
              </span>
            </div>
            {isStep1Done ? (
              <span className="text-xs font-bold text-emerald-700">
                {isBn
                  ? `✓ ${membersCountStr} জন যুক্ত`
                  : `✓ ${membersCountStr} joined`}
              </span>
            ) : null}
          </div>

          {/* Inline share actions when step 1 is not done */}
          {!isStep1Done ? (
            <div className="pt-0.5">
              <InviteFriendsCard
                slug={slug}
                tripName={tripName}
                destination={destination}
                locale={locale}
                compact={true}
              />
            </div>
          ) : null}
        </div>

        {/* Step 2: Add First Expense (প্রথম খরচ লিখুন) */}
        <div
          data-testid="onboarding-step-2"
          className={`flex items-center justify-between rounded-2xl border p-3 sm:p-3.5 transition-all ${
            isStep2Done
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-[var(--color-border)] bg-white shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                isStep2Done
                  ? "bg-emerald-600 text-white"
                  : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
              }`}
            >
              {isStep2Done ? "✓" : num2}
            </span>
            <span
              className={`text-xs sm:text-sm font-bold ${
                isStep2Done
                  ? "text-emerald-900 line-through decoration-emerald-600/50"
                  : "text-[var(--color-fg)]"
              }`}
            >
              {labels.stepExpense}
            </span>
          </div>
          {isStep2Done ? (
            <span className="text-xs font-bold text-emerald-700">
              {isBn
                ? `✓ ${toBanglaDigits(expenseCount)}টি খরচ`
                : `✓ ${expenseCount} expense${expenseCount === 1 ? "" : "s"}`}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => scrollToAddExpense()}
              className="text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
            >
              {isBn ? "খরচ লিখুন ↓" : "Add expense ↓"}
            </button>
          )}
        </div>

        {/* Step 3: Settle Up (হিসাব মেলান) */}
        <div
          data-testid="onboarding-step-3"
          className={`flex items-center justify-between rounded-2xl border p-3 sm:p-3.5 transition-all ${
            isStep3Done
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-[var(--color-border)] bg-white shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                isStep3Done
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {isStep3Done ? "✓" : num3}
            </span>
            <span
              className={`text-xs sm:text-sm font-bold ${
                isStep3Done
                  ? "text-emerald-900 line-through decoration-emerald-600/50"
                  : "text-neutral-500"
              }`}
            >
              {labels.stepSettle}
            </span>
          </div>
          {isStep3Done ? (
            <span className="text-xs font-bold text-emerald-700">
              {isBn ? "✓ হিসাব তৈরি" : "✓ Ready"}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">
              {isBn ? "১ ও ২ নম্বর ধাপের পর" : "After steps 1 & 2"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
