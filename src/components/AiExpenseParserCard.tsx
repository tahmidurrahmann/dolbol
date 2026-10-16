"use client";

import { useState } from "react";
import { saveExpenseAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { DatePickerField } from "@/components/DatePickerField";
import type { ExistingExpenseSummary } from "@/components/ExpenseFormCard";
import type { ParsedExpenseDraft } from "@/lib/ai-parser";
import type { ExpenseCategoryValue, MemberInput } from "@/lib/money";

export interface AiExpenseParserLabels {
  cardTitle: string;
  cardSubtitle: string;
  inputPlaceholder: string;
  tryExamplesLabel: string;
  parseButton: string;
  parsingButton: string;
  confirmCardBadge: string;
  confirmCardNote: string;
  rawInputLabel: string;
  titleLabel: string;
  amountLabel: string;
  categoryLabel: string;
  dateLabel: string;
  paidByLabel: string;
  participantsLabel: string;
  selectAll: string;
  confirmSaveButton: string;
  discardDraftButton: string;
  duplicateWarningTitle: string;
  duplicateWarningBody: string;
  confirmDuplicateLabel: string;
  errMissingAmount: string;
  errRateLimited: string;
  errGeneric: string;
  categories: Record<ExpenseCategoryValue, string>;
}

interface AiExpenseParserCardProps {
  slug: string;
  members: MemberInput[];
  defaultDateYyyyMmDd: string;
  existingExpenses: ExistingExpenseSummary[];
  labels: AiExpenseParserLabels;
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

export function AiExpenseParserCard({
  slug,
  members,
  defaultDateYyyyMmDd,
  existingExpenses,
  labels,
}: AiExpenseParserCardProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedExpenseDraft | null>(null);

  // Editable state inside the Confirm Card
  const [titleStr, setTitleStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [categoryVal, setCategoryVal] = useState<ExpenseCategoryValue>("FOOD");
  const [dateStr, setDateStr] = useState(defaultDateYyyyMmDd);
  const [paidByVal, setPaidByVal] = useState(members[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    members.map((m) => m.id),
  );

  const firstMemberName = members[0]?.displayName ?? "করিম";
  const secondMemberName = members[1]?.displayName ?? "সুমি";

  const samplePrompts = [
    `রাতের খাবার ১২০০ টাকা ${firstMemberName} দিয়েছে সবাই`,
    `CNG bhara 450 tk ${firstMemberName} paid for ${firstMemberName} and ${secondMemberName}`,
    `হোটেল বুকিং ৫০০০ টাকা আমি দিয়েছি সবার জন্য`,
  ];

  async function handleParse(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (!rawText.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/trips/${slug}/parse-expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        draft?: ParsedExpenseDraft;
        error?: string;
        retryAfterSeconds?: number;
      };

      if (!res.ok || !data.ok || !data.draft) {
        if (res.status === 429 || data.error === "rate_limited") {
          setErrorMsg(
            `${labels.errRateLimited} (${data.retryAfterSeconds ?? 30}s)`,
          );
        } else if (data.error === "missing_amount") {
          setErrorMsg(labels.errMissingAmount);
        } else {
          setErrorMsg(labels.errGeneric);
        }
        return;
      }

      const d = data.draft;
      setDraft(d);
      setTitleStr(d.title);
      setAmountStr(String(d.amount));
      setCategoryVal(d.category);
      setDateStr(defaultDateYyyyMmDd);
      setPaidByVal(d.paidByMemberId);
      setSelectedIds(d.participantMemberIds);
    } catch {
      setErrorMsg(labels.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  function toggleParticipant(memberId: string): void {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  }

  const totalAmount = Math.trunc(toAsciiNumber(amountStr));
  const candidateNormTitle = normalizeTitle(titleStr);
  const matchingDuplicate =
    draft && totalAmount > 0
      ? (existingExpenses.find((exp) => {
          if (exp.amount !== totalAmount) return false;
          if (exp.expenseDateYyyyMmDd !== dateStr) return false;
          const sameTitle =
            candidateNormTitle.length > 0 &&
            normalizeTitle(exp.title) === candidateNormTitle;
          const samePayerAndCat =
            exp.paidById === paidByVal && exp.category === categoryVal;
          return sameTitle || samePayerAndCat;
        }) ?? null)
      : null;

  return (
    <div className="space-y-4 rounded-xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-primary)]">
          ✨ {labels.cardTitle}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {labels.cardSubtitle}
        </p>
      </div>

      {/* Step 6.1: Single text box accepting Bangla or Banglish */}
      <form onSubmit={handleParse} className="space-y-3">
        <textarea
          rows={2}
          required
          maxLength={500}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={labels.inputPlaceholder}
          className="w-full rounded-xl border border-[var(--color-border)] bg-white p-3 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
        />

        {/* Quick example chips */}
        <div className="space-y-1">
          <span className="block text-xs font-semibold text-[var(--color-fg-muted)]">
            {labels.tryExamplesLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setRawText(sample)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-left text-xs text-[var(--color-fg)] hover:bg-[var(--color-border)]"
              >
                &ldquo;{sample}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {errorMsg ? (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
          >
            {errorMsg}
          </div>
        ) : null}

        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? labels.parsingButton : labels.parseButton}
        </Button>
      </form>

      {/* Step 6.4: Confirm Card before saving (NEVER auto-saves) */}
      {draft ? (
        <div className="space-y-4 rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2.5">
            <div>
              <span className="inline-block rounded-md bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-bold text-white">
                {labels.confirmCardBadge}
              </span>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                {labels.confirmCardNote}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs font-semibold text-red-700 underline"
            >
              {labels.discardDraftButton}
            </button>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs text-[var(--color-fg-muted)]">
            <span className="font-semibold text-[var(--color-fg)]">
              {labels.rawInputLabel}
            </span>{" "}
            &ldquo;{draft.rawInput}&rdquo;
          </div>

          <form action={saveExpenseAction} className="space-y-3.5">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="splitType" value="EQUAL" />
            <input type="hidden" name="rawInput" value={draft.rawInput} />
            {draft.routeFrom ? (
              <input type="hidden" name="routeFrom" value={draft.routeFrom} />
            ) : null}
            {draft.routeTo ? (
              <input type="hidden" name="routeTo" value={draft.routeTo} />
            ) : null}
            {draft.placeName ? (
              <input type="hidden" name="placeName" value={draft.placeName} />
            ) : null}

            <div className="space-y-1">
              <label
                htmlFor="ai-title"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.titleLabel}
              </label>
              <input
                id="ai-title"
                name="title"
                type="text"
                required
                maxLength={100}
                value={titleStr}
                onChange={(e) => setTitleStr(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base font-semibold text-[var(--color-fg)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="ai-amount"
                  className="block text-xs font-semibold text-[var(--color-fg)]"
                >
                  {labels.amountLabel}
                </label>
                <input
                  id="ai-amount"
                  name="amount"
                  type="text"
                  inputMode="numeric"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base font-bold text-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="ai-category"
                  className="block text-xs font-semibold text-[var(--color-fg)]"
                >
                  {labels.categoryLabel}
                </label>
                <select
                  id="ai-category"
                  name="category"
                  value={categoryVal}
                  onChange={(e) =>
                    setCategoryVal(e.target.value as ExpenseCategoryValue)
                  }
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-[var(--color-fg)]"
                >
                  {(
                    Object.keys(labels.categories) as ExpenseCategoryValue[]
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {labels.categories[cat]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DatePickerField
                id="ai-date"
                name="expenseDate"
                value={dateStr}
                onChange={setDateStr}
                label={labels.dateLabel}
                required
                showQuickPills={true}
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="ai-paidBy"
                  className="block text-sm font-semibold text-[var(--color-fg)]"
                >
                  {labels.paidByLabel}
                  <span className="ml-1 font-bold text-red-500">*</span>
                </label>
                <select
                  id="ai-paidBy"
                  name="paidById"
                  value={paidByVal}
                  onChange={(e) => setPaidByVal(e.target.value)}
                  className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)]"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.emoji ?? "🎒"} {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-fg)]">
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

              <div className="grid grid-cols-2 gap-2">
                {members.map((m) => {
                  const checked = selectedIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        checked
                          ? "border-[var(--color-primary)] bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
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
            </div>

            {matchingDuplicate ? (
              <div className="space-y-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-950">
                <p className="text-xs font-bold">
                  {labels.duplicateWarningTitle}
                </p>
                <p className="text-xs">
                  {labels.duplicateWarningBody}{" "}
                  <strong>
                    &ldquo;{matchingDuplicate.title}&rdquo; (৳
                    {matchingDuplicate.amount})
                  </strong>
                </p>
                <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-semibold">
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

            <Button type="submit" variant="primary">
              ✓ {labels.confirmSaveButton}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
