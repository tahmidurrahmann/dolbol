"use client";

import Link from "next/link";
import { useState } from "react";
import { saveExpenseAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { DatePickerField } from "@/components/DatePickerField";
import type {
  ExpenseCategoryValue,
  MemberInput,
  ShareOutput,
  SplitTypeValue,
} from "@/lib/money";

export interface EditableExpenseData {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDateYyyyMmDd: string;
  paidById: string;
  splitType: SplitTypeValue;
  note: string | null;
  shares: ShareOutput[];
}

export interface ExistingExpenseSummary {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDateYyyyMmDd: string;
  paidById: string;
}

export interface ExpenseFormLabels {
  addExpenseTitle: string;
  editExpenseTitle: string;
  cancelEdit: string;
  titleLabel: string;
  titlePlaceholder: string;
  amountLabel: string;
  amountPlaceholder: string;
  categoryLabel: string;
  dateLabel: string;
  paidByLabel: string;
  splitTypeLabel: string;
  splitEqual: string;
  splitExact: string;
  splitPercent: string;
  participantsLabel: string;
  selectAll: string;
  leftoverNote: string;
  exactSumStatus: string;
  percentSumStatus: string;
  noteLabel: string;
  notePlaceholder: string;
  saveExpenseButton: string;
  updateExpenseButton: string;
  duplicateWarningTitle: string;
  duplicateWarningBody: string;
  confirmDuplicateLabel: string;
  categories: Record<ExpenseCategoryValue, string>;
}

interface ExpenseFormCardProps {
  slug: string;
  members: MemberInput[];
  currentMemberId: string;
  defaultDateYyyyMmDd: string;
  editingExpense: EditableExpenseData | null;
  existingExpenses: ExistingExpenseSummary[];
  forceShowDuplicateConfirm?: boolean;
  labels: ExpenseFormLabels;
}

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

function toAsciiNumber(raw: string): number {
  const ascii = raw
    .replace(/[০-৯]/g, (c) => String(BANGLA_DIGITS.indexOf(c)))
    .replace(/,/g, "")
    .trim();
  const n = Number(ascii);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTitle(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function ExpenseFormCard({
  slug,
  members,
  currentMemberId,
  defaultDateYyyyMmDd,
  editingExpense,
  existingExpenses,
  forceShowDuplicateConfirm = false,
  labels,
}: ExpenseFormCardProps) {
  const [titleStr, setTitleStr] = useState<string>(editingExpense?.title ?? "");
  const [splitType, setSplitType] = useState<SplitTypeValue>(
    editingExpense?.splitType ?? "EQUAL",
  );
  const [amountStr, setAmountStr] = useState<string>(
    editingExpense ? String(editingExpense.amount) : "",
  );
  const [categoryVal, setCategoryVal] = useState<ExpenseCategoryValue>(
    editingExpense?.category ?? "FOOD",
  );
  const [dateStr, setDateStr] = useState<string>(
    editingExpense?.expenseDateYyyyMmDd ?? defaultDateYyyyMmDd,
  );
  const [paidByVal, setPaidByVal] = useState<string>(
    editingExpense?.paidById ?? currentMemberId,
  );

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const initialSelectedIds = editingExpense
    ? editingExpense.shares.map((s) => s.memberId)
    : members.map((m) => m.id);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  const initialExactMap: Record<string, string> = {};
  if (editingExpense && editingExpense.splitType === "EXACT") {
    for (const s of editingExpense.shares) {
      initialExactMap[s.memberId] = String(s.amount);
    }
  }
  const [exactValues, setExactValues] =
    useState<Record<string, string>>(initialExactMap);

  const initialPercentMap: Record<string, string> = {};
  if (editingExpense && editingExpense.splitType === "PERCENT") {
    for (const s of editingExpense.shares) {
      const pct =
        editingExpense.amount > 0
          ? Math.round((s.amount / editingExpense.amount) * 100)
          : 0;
      initialPercentMap[s.memberId] = String(pct);
    }
  }
  const [percentValues, setPercentValues] =
    useState<Record<string, string>>(initialPercentMap);

  function toggleParticipant(memberId: string): void {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  }

  function selectAllParticipants(): void {
    setSelectedIds(members.map((m) => m.id));
  }

  const totalAmount = Math.trunc(toAsciiNumber(amountStr));

  // Field validation messages
  const titleError =
    touched.title && titleStr.trim().length === 0
      ? "খরচের বিবরণ লিখুন (Title is required)."
      : null;

  const amountError =
    touched.amount && (amountStr.trim().length === 0 || totalAmount <= 0)
      ? "সঠিক টাকার পরিমাণ দিন (Amount must be a positive integer)."
      : null;

  const participantsError =
    splitType === "EQUAL" && selectedIds.length === 0
      ? "কমপক্ষে একজন অংশীদার নির্বাচন করুন (Select at least one participant)."
      : null;

  // Validation helpers for EXACT split
  const exactSum = members.reduce((sum, m) => {
    const val = toAsciiNumber(exactValues[m.id] ?? "0");
    return sum + Math.trunc(val);
  }, 0);
  const exactDiff = totalAmount - exactSum;

  // Validation helpers for PERCENT split
  const percentSum = members.reduce((sum, m) => {
    const val = toAsciiNumber(percentValues[m.id] ?? "0");
    return sum + Math.trunc(val);
  }, 0);

  // Duplicate check
  const candidateNormTitle = normalizeTitle(titleStr);
  const matchingDuplicate =
    totalAmount > 0
      ? existingExpenses.find((exp) => {
          if (editingExpense && exp.id === editingExpense.id) return false;
          if (exp.amount !== totalAmount) return false;
          if (exp.expenseDateYyyyMmDd !== dateStr) return false;
          const sameTitle =
            candidateNormTitle.length > 0 &&
            normalizeTitle(exp.title) === candidateNormTitle;
          const samePayerAndCat =
            exp.paidById === paidByVal && exp.category === categoryVal;
          return sameTitle || samePayerAndCat;
        }) ?? null
      : null;

  const showDuplicateWarning = Boolean(matchingDuplicate) || forceShowDuplicateConfirm;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched({ title: true, amount: true });
    if (
      titleStr.trim().length === 0 ||
      totalAmount <= 0 ||
      (splitType === "EQUAL" && selectedIds.length === 0) ||
      (splitType === "EXACT" && exactDiff !== 0) ||
      (splitType === "PERCENT" && percentSum !== 100)
    ) {
      e.preventDefault();
      return;
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-lg">
            {editingExpense ? "✏️" : "➕"}
          </span>
          <h2 className="text-lg font-bold text-[var(--color-fg)]">
            {editingExpense ? labels.editExpenseTitle : labels.addExpenseTitle}
          </h2>
        </div>

        {editingExpense ? (
          <Link
            href={`/trips/${slug}`}
            className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-border)] transition-colors"
          >
            {labels.cancelEdit}
          </Link>
        ) : null}
      </div>

      <form action={saveExpenseAction} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        {editingExpense ? (
          <input type="hidden" name="expenseId" value={editingExpense.id} />
        ) : null}
        <input type="hidden" name="splitType" value={splitType} />

        {/* Title Input (Required) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="exp-title"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.titleLabel}
              <span className="ml-1 font-bold text-red-500">*</span>
            </label>
            <span className="text-xs text-[var(--color-fg-muted)]">আবশ্যক</span>
          </div>

          <input
            id="exp-title"
            name="title"
            type="text"
            required
            maxLength={100}
            value={titleStr}
            onChange={(e) => setTitleStr(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, title: true }))}
            placeholder={labels.titlePlaceholder}
            className={`min-h-[46px] w-full rounded-xl border bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none ${
              titleError
                ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            }`}
          />

          {titleError ? (
            <p className="flex items-center gap-1 text-xs font-medium text-red-600">
              <span>⚠️</span>
              <span>{titleError}</span>
            </p>
          ) : null}
        </div>

        {/* Amount & Category */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Amount (Required) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="exp-amount"
                className="block text-sm font-semibold text-[var(--color-fg)]"
              >
                {labels.amountLabel}
                <span className="ml-1 font-bold text-red-500">*</span>
              </label>
              <span className="text-xs text-[var(--color-fg-muted)]">পূর্ণ টাকা</span>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-[var(--color-primary)]">
                ৳
              </span>
              <input
                id="exp-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
                placeholder={labels.amountPlaceholder}
                className={`min-h-[46px] w-full rounded-xl border bg-white pl-8 pr-3.5 py-2 text-base font-bold text-[var(--color-primary)] shadow-xs transition-all outline-none ${
                  amountError
                    ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                    : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                }`}
              />
            </div>

            {amountError ? (
              <p className="flex items-center gap-1 text-xs font-medium text-red-600">
                <span>⚠️</span>
                <span>{amountError}</span>
              </p>
            ) : null}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label
              htmlFor="exp-category"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.categoryLabel}
            </label>
            <select
              id="exp-category"
              name="category"
              value={categoryVal}
              onChange={(e) =>
                setCategoryVal(e.target.value as ExpenseCategoryValue)
              }
              className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base font-medium text-[var(--color-fg)] shadow-xs transition-all outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              {(Object.keys(labels.categories) as ExpenseCategoryValue[]).map(
                (cat) => (
                  <option key={cat} value={cat}>
                    {labels.categories[cat]}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        {/* Date (using custom DatePickerField) & Payer */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatePickerField
            id="exp-date"
            name="expenseDate"
            value={dateStr}
            onChange={setDateStr}
            label={labels.dateLabel}
            required
            showQuickPills={true}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="exp-paidBy"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.paidByLabel}
              <span className="ml-1 font-bold text-red-500">*</span>
            </label>
            <select
              id="exp-paidBy"
              name="paidById"
              value={paidByVal}
              onChange={(e) => setPaidByVal(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base font-semibold text-[var(--color-fg)] shadow-xs transition-all outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji ?? "🎒"} {m.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Split Type Selector */}
        <div className="space-y-2 pt-1">
          <span className="block text-sm font-semibold text-[var(--color-fg)]">
            {labels.splitTypeLabel}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["EQUAL", labels.splitEqual, "🤝"],
                ["EXACT", labels.splitExact, "৳"],
                ["PERCENT", labels.splitPercent, "%"],
              ] as const
            ).map(([type, text, icon]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                  splitType === type
                    ? "border-2 border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-xs scale-[1.02]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg)] hover:bg-[var(--color-border)]"
                }`}
              >
                <span>{icon}</span>
                <span>{text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* EQUAL Split Participants */}
        {splitType === "EQUAL" ? (
          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--color-fg)]">
                {labels.participantsLabel}
                <span className="ml-1 font-bold text-red-500">*</span>
              </span>
              <button
                type="button"
                onClick={selectAllParticipants}
                className="rounded-md px-2 py-0.5 text-xs font-bold text-[var(--color-primary)] hover:underline"
              >
                ✓ {labels.selectAll}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {members.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                      checked
                        ? "border-2 border-[var(--color-primary)] bg-white text-[var(--color-fg)] shadow-xs"
                        : "border-[var(--color-border)] bg-transparent text-[var(--color-fg-muted)] hover:bg-white/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="participantIds"
                      value={m.id}
                      checked={checked}
                      onChange={() => toggleParticipant(m.id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span className="truncate">
                      {m.emoji ?? "🎒"} {m.displayName}
                    </span>
                  </label>
                );
              })}
            </div>

            {participantsError ? (
              <p className="flex items-center gap-1 text-xs font-medium text-red-600">
                <span>⚠️</span>
                <span>{participantsError}</span>
              </p>
            ) : null}

            <p className="text-xs text-[var(--color-fg-muted)]">
              💡 {labels.leftoverNote}
            </p>
          </div>
        ) : null}

        {/* EXACT Split Inputs */}
        {splitType === "EXACT" ? (
          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[var(--color-fg)]">
                {labels.exactSumStatus}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 font-bold ${
                  exactDiff === 0
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-red-100 text-red-900"
                }`}
              >
                {exactDiff === 0 ? "✓ মিলেছে" : `বাকি: ৳${exactDiff}`}
              </span>
            </div>

            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-2.5 shadow-xs"
                >
                  <span className="text-sm font-semibold text-[var(--color-fg)]">
                    {m.emoji ?? "🎒"} {m.displayName}
                  </span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-primary)]">
                      ৳
                    </span>
                    <input
                      name={`exact_${m.id}`}
                      type="text"
                      inputMode="numeric"
                      value={exactValues[m.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setExactValues((prev) => ({
                          ...prev,
                          [m.id]: e.target.value,
                        }))
                      }
                      className="min-h-[40px] w-28 rounded-lg border border-[var(--color-border)] bg-white pl-6 pr-2.5 text-right text-base font-semibold text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* PERCENT Split Inputs */}
        {splitType === "PERCENT" ? (
          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[var(--color-fg)]">
                {labels.percentSumStatus}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 font-bold ${
                  percentSum === 100
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-red-100 text-red-900"
                }`}
              >
                {percentSum}% / 100%
              </span>
            </div>

            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-2.5 shadow-xs"
                >
                  <span className="text-sm font-semibold text-[var(--color-fg)]">
                    {m.emoji ?? "🎒"} {m.displayName}
                  </span>
                  <div className="relative">
                    <input
                      name={`percent_${m.id}`}
                      type="text"
                      inputMode="numeric"
                      value={percentValues[m.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setPercentValues((prev) => ({
                          ...prev,
                          [m.id]: e.target.value,
                        }))
                      }
                      className="min-h-[40px] w-24 rounded-lg border border-[var(--color-border)] bg-white pr-7 pl-2.5 text-right text-base font-semibold text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)]"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-fg-muted)]">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Note */}
        <div className="space-y-1.5">
          <label
            htmlFor="exp-note"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {labels.noteLabel}
          </label>
          <input
            id="exp-note"
            name="note"
            type="text"
            maxLength={200}
            defaultValue={editingExpense?.note ?? ""}
            placeholder={labels.notePlaceholder}
            className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        {/* Duplicate-entry Warning Banner */}
        {showDuplicateWarning ? (
          <div className="space-y-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-sm animate-in fade-in">
            <p className="text-sm font-bold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{labels.duplicateWarningTitle}</span>
            </p>
            {matchingDuplicate ? (
              <p className="text-xs">
                {labels.duplicateWarningBody}{" "}
                <strong>
                  &ldquo;{matchingDuplicate.title}&rdquo; (৳
                  {matchingDuplicate.amount})
                </strong>
              </p>
            ) : null}
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 pt-1 text-sm font-semibold">
              <input
                type="checkbox"
                name="confirmDuplicate"
                value="true"
                required
                className="h-4 w-4 accent-amber-700"
              />
              <span>{labels.confirmDuplicateLabel}</span>
            </label>
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          className="w-full min-h-[50px] rounded-xl text-base font-bold shadow-md hover:shadow-lg transition-all"
        >
          {editingExpense
            ? `✓ ${labels.updateExpenseButton}`
            : `➕ ${labels.saveExpenseButton}`}
        </Button>
      </form>
    </div>
  );
}
