"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "expenses" | "balances" | "plan" | "members"
  >(initialTab);

  const selectTab = useCallback(
    (tabId: "expenses" | "balances" | "plan" | "members") => {
      setActiveTab(tabId);
      router.refresh();
      try {
        localStorage.setItem("triphub_active_tab", tabId);
      } catch {
        // ignore
      }
    },
    [router],
  );

  // Auto-refetch when user switches browser tab or window gains focus
  useEffect(() => {
    function handleSync() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    window.addEventListener("focus", handleSync);
    document.addEventListener("visibilitychange", handleSync);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 15000);

    return () => {
      window.removeEventListener("focus", handleSync);
      document.removeEventListener("visibilitychange", handleSync);
      clearInterval(interval);
    };
  }, [router]);

  // Restore saved tab asynchronously after hydration to prevent SSR hydration mismatch
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const hash = window.location.hash.replace("#", "");
        if (
          hash === "expenses" ||
          hash === "balances" ||
          hash === "plan" ||
          hash === "members"
        ) {
          setActiveTab(hash);
          return;
        }
        const saved = localStorage.getItem("triphub_active_tab");
        if (
          saved === "expenses" ||
          saved === "balances" ||
          saved === "plan" ||
          saved === "members"
        ) {
          setActiveTab(saved);
        }
      } catch {
        // ignore
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const tabs = [
    {
      id: "expenses" as const,
      icon: "💳",
      label: locale === "bn" ? "খরচ" : "Expenses",
    },
    {
      id: "balances" as const,
      icon: "🧮",
      label: locale === "bn" ? "হিসাব" : "Who owes whom",
    },
    {
      id: "plan" as const,
      icon: "🗺️",
      label: locale === "bn" ? "প্ল্যান" : "Plan",
    },
    {
      id: "members" as const,
      icon: "👥",
      label: locale === "bn" ? "বন্ধুরা" : "Friends",
    },
  ];

  useEffect(() => {
    const handleJump = () => {
      selectTab("expenses");
      setTimeout(() => {
        const el = document.getElementById("expense-box");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    };

    window.addEventListener("jump-to-add-expense", handleJump);
    return () => window.removeEventListener("jump-to-add-expense", handleJump);
  }, [selectTab]);

  return (
    <div className="space-y-5">
      {/* 1. Desktop Tab Navigation (Left aligned, soft pill style for >= 1000px) */}
      <div className="hidden min-[1000px]:flex sticky top-[68px] z-20 justify-start py-1">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#edf3f0]/95 p-1.5 border border-emerald-100/90 shadow-xs backdrop-blur-md">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`flex min-h-[42px] items-center justify-center gap-2 rounded-full px-5 py-2 text-xs sm:text-sm font-extrabold transition-all select-none cursor-pointer ${
                  isActive
                    ? "bg-white text-emerald-950 shadow-xs border border-emerald-200/60 scale-[1.01]"
                    : "text-gray-600 hover:text-gray-900 hover:bg-white/40"
                }`}
              >
                <span className="text-sm sm:text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Mobile/Tablet Bottom Navigation Dock (< 1000px, Screenshot 2 design, 4 tabs distributed evenly, zero scrolling) */}
      <div className="fixed bottom-3 inset-x-2 sm:inset-x-6 z-40 mx-auto max-w-lg min-[1000px]:hidden">
        <nav
          aria-label="Trip tabs"
          className="grid grid-cols-4 gap-1 rounded-2xl border border-gray-200/90 bg-white/95 p-1 sm:p-1.5 shadow-xl backdrop-blur-md"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (activeTab === tab.id && tab.id === "expenses") {
                    const el = document.getElementById("expense-box");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  } else {
                    selectTab(tab.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className={`flex flex-col items-center justify-center py-2 px-0.5 sm:px-1 rounded-xl transition-all select-none cursor-pointer active:scale-95 ${
                  isActive
                    ? "bg-[#e8f5ee] text-[#0b724f] font-black border border-emerald-200/80 shadow-2xs"
                    : "text-gray-500 hover:text-gray-900 font-bold"
                }`}
              >
                <span className="text-base sm:text-lg leading-none mb-0.5">{tab.icon}</span>
                <span className="text-[10px] sm:text-[11px] font-bold leading-tight tracking-tight text-center truncate w-full">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
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
