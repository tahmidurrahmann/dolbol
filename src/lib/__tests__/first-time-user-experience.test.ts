import { describe, expect, it } from "vitest";
import bnMessages from "@/messages/bn.json";
import enMessages from "@/messages/en.json";
import {
  deriveOnboardingStepStates,
  shouldShowOnboardingChecklist,
  shouldShowSummaryCards,
} from "@/lib/onboarding";

describe("First-Time User Experience & Onboarding", () => {
  describe("Onboarding checklist visibility", () => {
    it("shows checklist when trip has fewer than 2 members and 0 expenses", () => {
      expect(shouldShowOnboardingChecklist(1, 0)).toBe(true);
    });

    it("shows checklist when trip has 2 members but 0 expenses", () => {
      expect(shouldShowOnboardingChecklist(2, 0)).toBe(true);
    });

    it("shows checklist when trip has 1 member and 1+ expenses", () => {
      expect(shouldShowOnboardingChecklist(1, 3)).toBe(true);
    });

    it("hides checklist once trip has at least 2 members AND at least 1 expense", () => {
      expect(shouldShowOnboardingChecklist(2, 1)).toBe(false);
      expect(shouldShowOnboardingChecklist(3, 5)).toBe(false);
    });
  });

  describe("Onboarding step state derivations", () => {
    it("marks 0 steps complete for 1 member and 0 expenses", () => {
      const states = deriveOnboardingStepStates(1, 0);
      expect(states.isStep1Done).toBe(false);
      expect(states.isStep2Done).toBe(false);
      expect(states.isStep3Done).toBe(false);
      expect(states.completedCount).toBe(0);
    });

    it("marks step 1 complete when 2+ members join", () => {
      const states = deriveOnboardingStepStates(2, 0);
      expect(states.isStep1Done).toBe(true);
      expect(states.isStep2Done).toBe(false);
      expect(states.isStep3Done).toBe(false);
      expect(states.completedCount).toBe(1);
    });

    it("marks step 2 complete when 1+ expenses added with only 1 member", () => {
      const states = deriveOnboardingStepStates(1, 1);
      expect(states.isStep1Done).toBe(false);
      expect(states.isStep2Done).toBe(true);
      expect(states.isStep3Done).toBe(false);
      expect(states.completedCount).toBe(1);
    });

    it("marks all 3 steps complete when 2+ members and 1+ expenses exist", () => {
      const states = deriveOnboardingStepStates(2, 1);
      expect(states.isStep1Done).toBe(true);
      expect(states.isStep2Done).toBe(true);
      expect(states.isStep3Done).toBe(true);
      expect(states.completedCount).toBe(3);
    });
  });

  describe("Summary cards visibility (Total trip cost & My balance)", () => {
    it("hides summary cards for 1 member and 0 expenses", () => {
      expect(shouldShowSummaryCards(1, 0)).toBe(false);
    });

    it("hides summary cards for 2 members and 0 expenses", () => {
      expect(shouldShowSummaryCards(2, 0)).toBe(false);
    });

    it("hides summary cards for 1 member and 1 expense", () => {
      expect(shouldShowSummaryCards(1, 1)).toBe(false);
    });

    it("shows summary cards once there are at least 2 members and at least 1 expense", () => {
      expect(shouldShowSummaryCards(2, 1)).toBe(true);
      expect(shouldShowSummaryCards(4, 10)).toBe(true);
    });
  });

  describe("Who owes whom empty state text & localization", () => {
    it("contains correct Bangla empty state text for < 2 members", () => {
      expect(bnMessages.money.whoOwesWhomNeedFriends).toBe(
        "বন্ধুরা যোগ দিলে এখানে কে কাকে কত দেবে দেখা যাবে",
      );
    });

    it("contains correct English empty state text for < 2 members", () => {
      expect(enMessages.money.whoOwesWhomNeedFriends).toBe(
        "When friends join, see who owes whom here",
      );
    });

    it("contains onboarding checklist titles in message files", () => {
      expect(bnMessages.tripPage.onboardingChecklistTitle).toBe("শুরুর প্রস্তুতি");
      expect(bnMessages.tripPage.onboardingStepInvite).toBe("বন্ধুদের ডাকুন");
      expect(bnMessages.tripPage.onboardingStepExpense).toBe("প্রথম খরচ লিখুন");
      expect(bnMessages.tripPage.onboardingStepSettle).toBe("হিসাব মেলান");

      expect(enMessages.tripPage.onboardingChecklistTitle).toBe("Getting started");
      expect(enMessages.tripPage.onboardingStepInvite).toBe("Invite friends");
      expect(enMessages.tripPage.onboardingStepExpense).toBe("Add the first expense");
      expect(enMessages.tripPage.onboardingStepSettle).toBe("See who owes whom");
    });

    it("contains manualFormToggle in message files matching requirements", () => {
      expect(bnMessages.money.manualFormToggle).toBe("form দিয়ে যোগ করুন");
      expect(enMessages.money.manualFormToggle).toBe("Add using form instead");
    });

    it("labels demo toggle as 'How expense works' / 'খরচ কীভাবে কাজ করে' in message files", () => {
      expect(bnMessages.expenseDemo.howExpenseWorks).toBe("খরচ কীভাবে কাজ করে");
      expect(enMessages.expenseDemo.howExpenseWorks).toBe("How expense works");
    });
  });

  describe("Explainer demo toggle on trip page", () => {
    it("renders ExpenseDemoToggle collapsed on initial load to save vertical space for new users", () => {
      const { readFileSync } = require("fs");
      const { join } = require("path");
      const tripPageContent = readFileSync(
        join(process.cwd(), "src/app/trips/[slug]/page.tsx"),
        "utf-8"
      );
      // Ensures the demo starts collapsed behind ExpenseDemoToggle
      expect(tripPageContent).toContain("<ExpenseDemoToggle");
      // Ensures raw ExpenseExplainerDemo is not rendered directly in the trip page
      expect(tripPageContent).not.toContain("<ExpenseExplainerDemo");
    });
  });
});
