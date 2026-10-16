"use client";

import { useState } from "react";
import { saveExpenseAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { DatePickerField } from "@/components/DatePickerField";
import { SelectField } from "@/components/SelectField";
import type { ExistingExpenseSummary } from "@/components/ExpenseFormCard";
import type { ParsedExpenseDraft } from "@/lib/ai-parser";
import { formatTaka } from "@/lib/format";
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
  locale?: "bn" | "en";
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
  locale = "bn",
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

  const firstMemberName = members[0]?.displayName ?? (locale === "bn" ? "করিম" : "Karim");
  const secondMemberName = members[1]?.displayName ?? (locale === "bn" ? "সুমি" : "Sumi");

  const samplePrompts =
    locale === "bn"
      ? [
          `রাতের খাবার ১২০০ টাকা ${firstMemberName} দিয়েছে সবাই`,
          `ডিনার ১২০০ ${firstMemberName} দিল সবার জন্য`,
          `সিএনজি ভাড়া ৪৫০ টাকা ${firstMemberName} দিল ${firstMemberName} ও ${secondMemberName} এর জন্য`,
        ]
      : [
          `Dinner 1200 ${firstMemberName} paid everyone`,
          `Lunch 850 tk ${firstMemberName} paid for all`,
          `CNG fare 450 tk ${firstMemberName} paid for ${firstMemberName} and ${secondMemberName}`,
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

  const isAllSelected = selectedIds.length === members.length;

  function handleToggleAll(): void {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(members.map((m) => m.id));
    }
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
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>✨</span>
          <span>{labels.cardTitle}</span>
        </h2>
        <p className="text-sm text-neutral-400">
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
          className="w-full rounded-2xl border border-[var(--color-border)] bg-white p-3.5 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15 focus:outline-none resize-none shadow-xs"
        />

        {/* Quick example chips */}
        <div className="space-y-1">
          <span className="block text-xs font-semibold text-neutral-400">
            {labels.tryExamplesLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setRawText(sample)}
                className="rounded-full border border-gray-200/90 bg-[#f4f7f5] px-3 py-1 text-left text-xs font-semibold text-gray-700 hover:bg-[#e8f5ee] hover:border-emerald-200 hover:text-[#0f6b4a] transition-all cursor-pointer shadow-2xs"
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
        <div className="space-y-4 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-surface-muted)] p-4 sm:p-5 shadow-xs">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2.5">
            <div>
              <span className="inline-block rounded-md bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-bold text-white">
                {labels.confirmCardBadge}
              </span>
              <p className="mt-1 text-xs text-neutral-400">
                {labels.confirmCardNote}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs font-semibold text-red-700 underline cursor-pointer"
            >
              {labels.discardDraftButton}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-xs text-neutral-400">
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

            {/* Amount */}
            <div className="space-y-1">
              <label
                htmlFor="ai-amount"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.amountLabel}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-[var(--color-primary)]">
                  ৳
                </span>
                <input
                  id="ai-amount"
                  name="amount"
                  type="text"
                  inputMode="numeric"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-white pl-10 pr-3.5 py-2 text-base font-bold text-[var(--color-primary)] shadow-xs focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15 outline-none"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <SelectField
                id="ai-category"
                name="category"
                value={categoryVal}
                onChange={(val) => setCategoryVal(val as ExpenseCategoryValue)}
                label={labels.categoryLabel}
                options={(
                  Object.keys(labels.categories) as ExpenseCategoryValue[]
                ).map((cat) => ({
                  value: cat,
                  label: labels.categories[cat],
                }))}
              />
            </div>

            {/* Date */}
            <div className="space-y-1">
              <DatePickerField
                id="ai-date"
                name="expenseDate"
                value={dateStr}
                onChange={setDateStr}
                label={labels.dateLabel}
                locale={locale}
                required
                showQuickPills={true}
              />
            </div>

            {/* Who Paid */}
            <div className="space-y-1">
              <SelectField
                id="ai-paidBy"
                name="paidById"
                value={paidByVal}
                onChange={setPaidByVal}
                label={labels.paidByLabel}
                required
                searchable={members.length > 5}
                options={members.map((m) => ({
                  value: m.id,
                  label: m.displayName,
                  icon: m.emoji ?? "🎒",
                  badge: m.isGuest ? "Guest" : undefined,
                }))}
              />
            </div>

            {/* Who Shared */}
            <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-fg)]">
                  {labels.participantsLabel}
                </span>
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/40 transition-colors cursor-pointer"
                >
                  {isAllSelected
                    ? locale === "bn"
                      ? "সবাই মুছুন"
                      : "Clear all"
                    : locale === "bn"
                      ? "সবাই"
                      : labels.selectAll}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {(() => {
                  const parsedTotal = toAsciiNumber(amountStr);
                  const equalSharePerPerson =
                    parsedTotal > 0 && selectedIds.length > 0
                      ? Math.floor(parsedTotal / selectedIds.length)
                      : 0;

                  return members.map((m) => {
                    const checked = selectedIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none active:scale-95 ${
                          checked
                            ? "bg-[var(--color-surface-muted)] text-[var(--color-fg)] border border-[var(--color-border)] shadow-2xs font-bold"
                            : "border border-[var(--color-border)] bg-white text-gray-800 shadow-2xs hover:border-[var(--color-primary)]/40 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="participantIds"
                          value={m.id}
                          checked={checked}
                          onChange={() => toggleParticipant(m.id)}
                          className="sr-only"
                        />
                        <span className="text-sm leading-none shrink-0">
                          {m.emoji ?? "🎒"}
                        </span>
                        <span className="whitespace-nowrap font-bold text-[var(--color-fg)]">
                          {m.displayName}{checked && equalSharePerPerson > 0 ? ":" : ""}
                        </span>
                        {checked && equalSharePerPerson > 0 ? (
                          <strong className="font-extrabold text-[var(--color-primary)] shrink-0">
                            {formatTaka(equalSharePerPerson, locale)}
                          </strong>
                        ) : null}
                      </label>
                    );
                  });
                })()}
              </div>

              {selectedIds.length === 0 ? (
                <p className="flex items-center gap-1 text-xs font-medium text-red-600 pt-1">
                  <span>⚠️</span>
                  <span>
                    {locale === "bn"
                      ? "কমপক্ষে একজন সদস্য নির্বাচন করুন।"
                      : "Select at least one participant."}
                  </span>
                </p>
              ) : null}
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

            <Button
              type="submit"
              variant="primary"
              disabled={selectedIds.length === 0 || totalAmount <= 0}
            >
              ✓ {labels.confirmSaveButton}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
