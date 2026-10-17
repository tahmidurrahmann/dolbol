"use client";

import { useState } from "react";
import { ExpenseExplainerDemo } from "@/components/ExpenseExplainerDemo";

import type { ExpenseExplainerDemoProps } from "@/components/ExpenseExplainerDemo";

interface ExpenseDemoToggleProps {
  locale: "bn" | "en";
  labels?: ExpenseExplainerDemoProps["labels"];
}

export function ExpenseDemoToggle({ locale, labels }: ExpenseDemoToggleProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/90 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-[#e8f5ee] hover:border-emerald-300 hover:text-[#0b724f] transition-all cursor-pointer shadow-2xs"
        >
          <span>▶</span>
          <span>{locale === "bn" ? "কীভাবে কাজ করে?" : "How it works?"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-neutral-500">
          {locale === "bn" ? "কীভাবে কাজ করে?" : "How it works?"}
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs font-semibold text-neutral-400 hover:text-neutral-700 cursor-pointer"
        >
          ✕ {locale === "bn" ? "বন্ধ করুন" : "Close"}
        </button>
      </div>
      <ExpenseExplainerDemo locale={locale} mode="trip" labels={labels} />
    </div>
  );
}
