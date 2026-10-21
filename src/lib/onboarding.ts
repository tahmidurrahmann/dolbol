/**
 * Pure helper functions for trip onboarding and summary visibility.
 * Kept in a server-safe module (no "use client") so Server Components can call them.
 */

export interface OnboardingStepStates {
  isStep1Done: boolean;
  isStep2Done: boolean;
  isStep3Done: boolean;
  completedCount: number;
}

/**
 * Derives the completion status of each onboarding step.
 */
export function deriveOnboardingStepStates(
  joinedMembersCount: number,
  expenseCount: number,
): OnboardingStepStates {
  const isStep1Done = joinedMembersCount >= 2;
  const isStep2Done = expenseCount >= 1;
  const isStep3Done = isStep1Done && isStep2Done;
  return {
    isStep1Done,
    isStep2Done,
    isStep3Done,
    completedCount: [isStep1Done, isStep2Done, isStep3Done].filter(Boolean)
      .length,
  };
}

/**
 * Returns true if the onboarding checklist should be visible (fewer than 2 joined members OR 0 expenses).
 */
export function shouldShowOnboardingChecklist(
  joinedMembersCount: number,
  expenseCount: number,
): boolean {
  return joinedMembersCount < 2 || expenseCount === 0;
}

/**
 * Returns true if summary cards should be shown (at least 2 joined members AND at least 1 expense).
 */
export function shouldShowSummaryCards(
  joinedMembersCount: number,
  expenseCount: number,
): boolean {
  return joinedMembersCount >= 2 && expenseCount >= 1;
}
