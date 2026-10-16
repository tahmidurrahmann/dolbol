"use client";

import Link from "next/link";
import { useState } from "react";
import { saveExpenseAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
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
  categories: Record<ExpenseCategoryValue, string>;
}

interface ExpenseFormCardProps {
  slug: string;
  members: MemberInput[];
  currentMemberId: string;
  defaultDateYyyyMmDd: string;
  editingExpense: EditableExpenseData | null;
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

export function ExpenseFormCard({
  slug,
  members,
  currentMemberId,
  defaultDateYyyyMmDd,
  editingExpense,
  labels,
}: ExpenseFormCardProps) {
  const [splitType, setSplitType] = useState<SplitTypeValue>(
    editingExpense?.splitType ?? "EQUAL",
  );
  const [amountStr, setAmountStr] = useState<string>(
    editingExpense ? String(editingExpense.amount) : "",
  );

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

  const totalAmount = Math.trunc(toAsciiNumber(amountStr));
  const exactSum = members.reduce(
    (sum, m) => sum + Math.trunc(toAsciiNumber(exactValues[m.id] ?? "")),
    0,
  );
  const percentSum = members.reduce(
    (sum, m) => sum + toAsciiNumber(percentValues[m.id] ?? ""),
    0,
  );

  function toggleParticipant(memberId: string): void {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {editingExpense ? labels.editExpenseTitle : labels.addExpenseTitle}
        </h2>
        {editingExpense ? (
          <Link
            href={`/trips/${slug}`}
            className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            {labels.cancelEdit}
          </Link>
        ) : null}
      </div>

      <form action={saveExpenseAction} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        {editingExpense ? (
          <input type="hidden" name="expenseId" value={editingExpense.id} />
        ) : null}
        <input type="hidden" name="splitType" value={splitType} />

        <div className="space-y-1.5">
          <label
            htmlFor="exp-title"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {labels.titleLabel}
          </label>
          <input
            id="exp-title"
            name="title"
            type="text"
            required
            maxLength={100}
            defaultValue={editingExpense?.title ?? ""}
            placeholder={labels.titlePlaceholder}
            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="exp-amount"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.amountLabel}
            </label>
            <input
              id="exp-amount"
              name="amount"
              type="text"
              inputMode="numeric"
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={labels.amountPlaceholder}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base font-semibold text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

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
              defaultValue={editingExpense?.category ?? "FOOD"}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="exp-date"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.dateLabel}
            </label>
            <input
              id="exp-date"
              name="expenseDate"
              type="date"
              required
              defaultValue={
                editingExpense?.expenseDateYyyyMmDd ?? defaultDateYyyyMmDd
              }
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="exp-paidBy"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.paidByLabel}
            </label>
            <select
              id="exp-paidBy"
              name="paidById"
              defaultValue={editingExpense?.paidById ?? currentMemberId}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji ?? "🎒"} {m.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Split Type selector */}
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-[var(--color-fg)]">
            {labels.splitTypeLabel}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["EQUAL", labels.splitEqual],
                ["EXACT", labels.splitExact],
                ["PERCENT", labels.splitPercent],
              ] as const
            ).map(([type, text]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={`min-h-[44px] rounded-lg border px-2 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  splitType === type
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {/* EQUAL Split Participants */}
        {splitType === "EQUAL" ? (
          <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-fg)]">
                {labels.participantsLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(members.map((m) => m.id))}
                className="text-xs font-semibold text-[var(--color-primary)] underline"
              >
                {labels.selectAll}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {members.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                      checked
                        ? "border-[var(--color-primary)] bg-white text-[var(--color-fg)]"
                        : "border-[var(--color-border)] bg-transparent text-[var(--color-fg-muted)]"
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
            <p className="text-xs text-[var(--color-fg-muted)]">
              {labels.leftoverNote}
            </p>
          </div>
        ) : null}

        {/* EXACT Split Inputs */}
        {splitType === "EXACT" ? (
          <div className="space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{labels.exactSumStatus}</span>
              <span
                className={
                  totalAmount - exactSum === 0
                    ? "text-[var(--color-primary)]"
                    : "text-red-700"
                }
              >
                ৳{totalAmount - exactSum}
              </span>
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <label
                    htmlFor={`exact_${m.id}`}
                    className="flex-1 truncate text-sm font-medium text-[var(--color-fg)]"
                  >
                    {m.emoji ?? "🎒"} {m.displayName}
                  </label>
                  <input
                    id={`exact_${m.id}`}
                    name={`exact_${m.id}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={exactValues[m.id] ?? ""}
                    onChange={(e) =>
                      setExactValues((prev) => ({
                        ...prev,
                        [m.id]: e.target.value,
                      }))
                    }
                    className="min-h-[44px] w-28 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-right text-base text-[var(--color-fg)]"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* PERCENT Split Inputs */}
        {splitType === "PERCENT" ? (
          <div className="space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{labels.percentSumStatus}</span>
              <span
                className={
                  Math.round(percentSum * 100) === 10000
                    ? "text-[var(--color-primary)]"
                    : "text-red-700"
                }
              >
                {percentSum}% / 100%
              </span>
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <label
                    htmlFor={`percent_${m.id}`}
                    className="flex-1 truncate text-sm font-medium text-[var(--color-fg)]"
                  >
                    {m.emoji ?? "🎒"} {m.displayName}
                  </label>
                  <input
                    id={`percent_${m.id}`}
                    name={`percent_${m.id}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0%"
                    value={percentValues[m.id] ?? ""}
                    onChange={(e) =>
                      setPercentValues((prev) => ({
                        ...prev,
                        [m.id]: e.target.value,
                      }))
                    }
                    className="min-h-[44px] w-28 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-right text-base text-[var(--color-fg)]"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <Button type="submit" variant="primary">
          {editingExpense
            ? labels.updateExpenseButton
            : labels.saveExpenseButton}
        </Button>
      </form>
    </div>
  );
}
