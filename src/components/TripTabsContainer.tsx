"use client";

import { useState } from "react";
import type { SupportedLocale } from "@/lib/format";

interface TripTabsContainerProps {
  locale: SupportedLocale;
  expensesSlot: React.ReactNode;
  balancesSlot: React.ReactNode;
  planSlot: React.ReactNode;
  membersSlot: React.ReactNode;
  initialTab?: "expenses" | "balances" | "plan" | "members";
}

export function TripTabsContainer({
  locale,
  expensesSlot,
  balancesSlot,
  planSlot,
  membersSlot,
  initialTab = "expenses",
}: TripTabsContainerProps) {
  const [activeTab, setActiveTab] = useState<
    "expenses" | "balances" | "plan" | "members"
  >(initialTab);

  const tabs = [
    {
      id: "expenses" as const,
      icon: "💳",
      label: locale === "bn" ? "খরচ ও অপশনসমূহ" : "Expenses",
    },
    {
      id: "balances" as const,
      icon: "🧮",
      label: locale === "bn" ? "ক্যালকুলেশন ও হিসাব" : "Calculations",
    },
    {
      id: "plan" as const,
      icon: "🗺️",
      label: locale === "bn" ? "ভোট ও সূচি" : "Plan & Itinerary",
    },
    {
      id: "members" as const,
      icon: "👥",
      label: locale === "bn" ? "সদস্য ও লগ" : "Members & Log",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Sticky Tab Navigation */}
      <div className="sticky top-[64px] z-20 -mx-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-2.5 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:bg-[var(--color-surface)]/95 sm:px-3 sm:py-2 shadow-xs">
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto sm:grid sm:grid-cols-4 sm:gap-2 sm:overflow-visible">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-[44px] shrink-0 sm:shrink items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-all select-none ${
                  isActive
                    ? "bg-[var(--color-primary)] text-white shadow-sm scale-[1.01]"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-fg-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-fg)]"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="space-y-5">
        {activeTab === "expenses" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {expensesSlot}
          </div>
        )}

        {activeTab === "balances" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {balancesSlot}
          </div>
        )}

        {activeTab === "plan" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {planSlot}
          </div>
        )}

        {activeTab === "members" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {membersSlot}
          </div>
        )}
      </div>
    </div>
  );
}
