"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  fallbackNotice?: string;
  errInputTooLong?: string;
  errLineTooLong?: string;
  errTooManyLines?: string;
  errEmptyInput?: string;
  needsReviewBadge?: string;
  settlementBadge?: string;
  resolveQuestion?: string;
  addAnotherExpense?: string;
  removeRow?: string;
  unresolvedQuestionsWarning?: string;
  missingAmountPrompt?: string;
  itemCountAndTotal?: string;
  saveAllButton?: string;
  undoButton?: string;
  undoingButton?: string;
  undoSuccess?: string;
  undoFailed?: string;
  undoCountNotice?: string;
  parsedSuccessButton?: string;
  newSectionIndicator?: string;
  newSectionBadge?: string;
  inputHelperText?: string;
  clearInputButton?: string;
  exampleDailyMealsTitle?: string;
  exampleDailyMealsBadge?: string;
  exampleTransportTitle?: string;
  exampleTransportBadge?: string;
  exampleHotelTitle?: string;
  exampleHotelBadge?: string;
  exampleSettlementTitle?: string;
  exampleSettlementBadge?: string;
}

export interface EditableExpenseItem {
  id: string;
  lineIndex: number;
  title: string;
  amount: number | null;
  amountStr: string;
  category: ExpenseCategoryValue;
  paidById: string;
  participantIds: string[];
  dateYyyyMmDd: string;
  confidence: "high" | "medium" | "low";
  question: string | null;
  needsAttention: boolean;
  isSettlement: boolean;
  receiverId: string | null;
  rawInput: string;
  routeFrom?: string | null;
  routeTo?: string | null;
  placeName?: string | null;
}

interface AiExpenseParserCardProps {
  slug: string;
  members: MemberInput[];
  currentMemberId?: string;
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

export function AiExpenseParserCard({
  slug,
  members,
  currentMemberId,
  defaultDateYyyyMmDd,
  existingExpenses,
  labels,
  locale = "bn",
}: AiExpenseParserCardProps) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reference for smooth scrolling down to confirm section
  const confirmSectionRef = useRef<HTMLFormElement>(null);
  const [justParsed, setJustParsed] = useState(false);
  const [lastParsedText, setLastParsedText] = useState<string | null>(null);

  // Multi-item Confirm state
  const [items, setItems] = useState<EditableExpenseItem[]>([]);
  const [parseSource, setParseSource] = useState<"llm" | "fallback" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);

  // Auto-dismiss submit success notification after 4.5s
  useEffect(() => {
    if (!submitSuccessMsg) return;
    const timer = setTimeout(() => {
      setSubmitSuccessMsg(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [submitSuccessMsg]);

  const myMemberId =
    currentMemberId ||
    members.find((m) => !m.isGuest)?.id ||
    members[0]?.id ||
    "";

  const firstMemberName =
    members[0]?.displayName ?? (locale === "bn" ? "করিম" : "Karim");
  const secondMemberName =
    members[1]?.displayName ?? (locale === "bn" ? "সুমি" : "Sumi");

  interface SamplePromptItem {
    id: string;
    displayText: string;
    text: string;
  }

  const samplePrompts: SamplePromptItem[] =
    locale === "bn"
      ? [
          {
            id: "daily-meals",
            displayText:
              "সকালের নাস্তা ২৫০, দুপুরের খাবার ৮০০, রাতের ডিনার ১২০০",
            text: "সকালের নাস্তা ২৫০, দুপুরের খাবার ৮০০, রাতের ডিনার ১২০০",
          },
          {
            id: "transport",
            displayText: `সিএনজি ভাড়া ৪৫০ টাকা ${firstMemberName} দিল`,
            text: `সিএনজি ভাড়া ৪৫০ টাকা ${firstMemberName} দিল`,
          },
          {
            id: "hotel",
            displayText: "হোটেল রুম ৩৫০০ টাকা",
            text: "হোটেল রুম ৩৫০০ টাকা",
          },
          {
            id: "settlement",
            displayText: `${secondMemberName} কে ৫০০ টাকা দিলাম`,
            text: `${secondMemberName} কে ৫০০ টাকা দিলাম`,
          },
        ]
      : [
          {
            id: "daily-meals",
            displayText:
              "Shokaler nasta 250, dupurer khabar 800, rater dinner 1200",
            text: "Shokaler nasta 250, dupurer khabar 800, rater dinner 1200",
          },
          {
            id: "transport",
            displayText: `CNG fare 450 tk paid by ${firstMemberName}`,
            text: `CNG fare 450 tk paid by ${firstMemberName}`,
          },
          {
            id: "hotel",
            displayText: "Hotel room 3500 tk",
            text: "Hotel room 3500 tk",
          },
          {
            id: "settlement",
            displayText: `${secondMemberName} ke 500 dilam`,
            text: `${secondMemberName} ke 500 dilam`,
          },
        ];

  async function handleParse(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (!rawText.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setSubmitSuccessMsg(null);

    try {
      const res = await fetch(`/api/trips/${slug}/parse-expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        items?: ParsedExpenseDraft[];
        source?: "llm" | "fallback";
        error?: string;
        retryAfterSeconds?: number;
      };

      if (!res.ok || !data.ok || !data.items) {
        if (res.status === 429 || data.error === "rate_limited") {
          setErrorMsg(
            `${labels.errRateLimited} (${data.retryAfterSeconds ?? 30}s)`,
          );
        } else if (data.error === "missing_amount") {
          setErrorMsg(labels.errMissingAmount);
        } else if (data.error === "too_many_lines") {
          setErrorMsg(
            labels.errTooManyLines ||
              (locale === "bn"
                ? "একসাথে সর্বোচ্চ ১৫টি লাইনের হিসাব দেওয়া যাবে।"
                : "Maximum 15 lines allowed at once."),
          );
        } else if (data.error === "line_too_long") {
          setErrorMsg(
            labels.errLineTooLong ||
              (locale === "bn"
                ? "একটি লাইন ২০০ অক্ষরের বেশি হতে পারবে না।"
                : "A single line cannot exceed 200 characters."),
          );
        } else if (data.error === "input_too_long") {
          setErrorMsg(
            labels.errInputTooLong ||
              (locale === "bn"
                ? "মোট লেখা ১৫০০ অক্ষরের বেশি হতে পারবে না।"
                : "Input exceeds 1500 characters."),
          );
        } else if (data.error === "empty_input") {
          setErrorMsg(
            labels.errEmptyInput ||
              (locale === "bn"
                ? "কিছু লিখে আবার চেষ্টা করুন।"
                : "Please enter some text."),
          );
        } else {
          setErrorMsg(labels.errGeneric);
        }
        return;
      }

      const editableRows: EditableExpenseItem[] = data.items.map(
        (draft, idx) => ({
          id: `item-${idx}-${Date.now()}`,
          lineIndex: draft.lineIndex,
          title: draft.title,
          amount: draft.amount,
          amountStr: draft.amount !== null ? String(draft.amount) : "",
          category: draft.category,
          paidById: draft.paidByMemberId || myMemberId || members[0]?.id || "",
          participantIds:
            draft.participantMemberIds.length > 0
              ? draft.participantMemberIds
              : members.map((m) => m.id),
          dateYyyyMmDd: defaultDateYyyyMmDd,
          confidence: draft.confidence,
          question: draft.question,
          needsAttention:
            draft.needsAttention ||
            draft.confidence !== "high" ||
            draft.amount === null ||
            Boolean(draft.question),
          isSettlement: draft.isSettlement,
          receiverId: draft.receiverMemberId,
          rawInput: draft.rawInput,
          routeFrom: draft.routeFrom,
          routeTo: draft.routeTo,
          placeName: draft.placeName,
        }),
      );

      setItems(editableRows);
      setParseSource(data.source ?? "llm");
      setLastParsedText(rawText.trim());
      setJustParsed(true);
      setTimeout(() => {
        confirmSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    } catch {
      setErrorMsg(labels.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  function updateItem(id: string, updates: Partial<EditableExpenseItem>): void {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  }

  function handleAmountChange(id: string, rawVal: string): void {
    const num = toAsciiNumber(rawVal);
    const validNum = num > 0 ? num : null;
    updateItem(id, {
      amountStr: rawVal,
      amount: validNum,
    });
  }

  function toggleParticipant(itemId: string, memberId: string): void {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.participantIds.includes(memberId);
        const nextIds = exists
          ? item.participantIds.filter((id) => id !== memberId)
          : [...item.participantIds, memberId];
        return { ...item, participantIds: nextIds };
      }),
    );
  }

  function toggleSelectAllParticipants(itemId: string): void {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const allSelected = item.participantIds.length === members.length;
        return {
          ...item,
          participantIds: allSelected ? [] : members.map((m) => m.id),
        };
      }),
    );
  }

  function resolveQuestion(id: string): void {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const hasMissingAmt = item.amount === null || item.amount <= 0;
        return {
          ...item,
          question: null,
          needsAttention: hasMissingAmt || item.confidence === "low",
        };
      }),
    );
  }

  function removeItem(id: string): void {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function addNewRow(): void {
    const newIdx = items.length;
    const newItem: EditableExpenseItem = {
      id: `item-${newIdx}-${Date.now()}`,
      lineIndex: newIdx,
      title: "",
      amount: null,
      amountStr: "",
      category: "FOOD",
      paidById: myMemberId || members[0]?.id || "",
      participantIds: members.map((m) => m.id),
      dateYyyyMmDd: defaultDateYyyyMmDd,
      confidence: "high",
      question: null,
      needsAttention: false,
      isSettlement: false,
      receiverId: null,
      rawInput: "",
    };
    setItems((prev) => [...prev, newItem]);
  }

  function handleDiscardAll(): void {
    setItems([]);
    setParseSource(null);
    setLastParsedText(null);
    setJustParsed(false);
  }

  const totalTaka = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  // Validation: disable Add All if any row is missing title, missing amount, has no participants, or has unresolved question
  const hasInvalidItem = items.some(
    (item) =>
      !item.title.trim() ||
      item.amount === null ||
      item.amount <= 0 ||
      item.participantIds.length === 0 ||
      Boolean(item.question),
  );

  const isSubmitDisabled = items.length === 0 || hasInvalidItem || submitting;

  // Batch save submission
  async function handleBatchSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        expenses: items.map((it) => ({
          title: it.title.trim(),
          amount: it.amount,
          category: it.category,
          expenseDate: it.dateYyyyMmDd,
          paidById: it.paidById,
          participantIds: it.participantIds,
          splitType: "EQUAL",
          rawInput: it.rawInput || undefined,
          isSettlement: it.isSettlement,
          receiverId: it.receiverId ?? undefined,
        })),
      };

      const res = await fetch(`/api/trips/${slug}/batch-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: string;
          failedIndex?: number;
          message?: string;
        };
        const errorDetail =
          typeof errData.failedIndex === "number"
            ? ` (Row #${errData.failedIndex + 1})`
            : "";
        setErrorMsg((errData.message || labels.errGeneric) + errorDetail);
        return;
      }

      const data = (await res.json()) as {
        ok: boolean;
        batchId: string;
        count: number;
      };

      const successNotice =
        locale === "bn"
          ? `${data.count}টি খরচ সফলভাবে যোগ করা হয়েছে।`
          : `${data.count} expense${data.count === 1 ? "" : "s"} added successfully.`;

      setSubmitSuccessMsg(successNotice);
      setItems([]);
      setParseSource(null);
      setRawText("");
      setLastParsedText(null);
      setJustParsed(false);
      router.refresh();
    } catch {
      setErrorMsg(labels.errGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  const isPromptUnchanged =
    items.length > 0 &&
    lastParsedText !== null &&
    rawText.trim() === lastParsedText;

  const isParseButtonDisabled = loading || !rawText.trim() || isPromptUnchanged;

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>✨</span>
          <span>{labels.cardTitle}</span>
        </h2>
        <p className="text-sm text-neutral-400">{labels.cardSubtitle}</p>
      </div>

      {/* Input Form accepting multi-line Bangla/Banglish */}
      <form onSubmit={handleParse} className="space-y-3.5">
        <div className="relative rounded-2xl border border-[var(--color-border)] bg-white p-3 sm:p-3.5 shadow-2xs transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15">
          <textarea
            ref={textareaRef}
            id="ai-expense-input"
            name="rawExpenseText"
            aria-label={labels.cardTitle}
            rows={3}
            required
            maxLength={1500}
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              if (justParsed) setJustParsed(false);
              if (submitSuccessMsg) setSubmitSuccessMsg(null);
            }}
            placeholder={
              labels.inputPlaceholder ||
              (locale === "bn"
                ? "যেমন: সকালের নাস্তা ২৫০, সিএনজি ভাড়া ৪৫০ (করিম দিল), রাতের ডিনার ১২০০"
                : "e.g.: shokaler nasta 250, CNG fare 450 (Karim paid), rater dinner 1200")
            }
            className="w-full bg-transparent text-base text-[var(--color-fg)] placeholder:text-neutral-400 placeholder:leading-relaxed focus:outline-none resize-y min-h-[95px] leading-relaxed"
          />

          {/* Bottom helper bar inside input container - fully responsive with no truncation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
            <span className="text-neutral-500 text-[11px] sm:text-xs leading-relaxed">
              {labels.inputHelperText ||
                (locale === "bn"
                  ? "💡 মেসেজের মতো স্বাভাবিক বাংলায় বা বাংলিশে লিখুন, নিচে যাচাই ও এডিট করতে পারবেন।"
                  : "💡 Type naturally in Bangla or Banglish, you can review and edit details below.")}
            </span>

            {rawText.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setRawText("");
                  if (justParsed) setJustParsed(false);
                  setErrorMsg(null);
                  if (submitSuccessMsg) setSubmitSuccessMsg(null);
                  textareaRef.current?.focus();
                }}
                className="self-end sm:self-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                title={
                  labels.clearInputButton ||
                  (locale === "bn" ? "মুছে ফেলুন" : "Clear")
                }
              >
                ✕{" "}
                {labels.clearInputButton ||
                  (locale === "bn" ? "মুছে ফেলুন" : "Clear")}
              </button>
            ) : null}
          </div>
        </div>

        {/* Quick realistic example chips */}
        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-neutral-600">
            {labels.tryExamplesLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  setRawText(sample.text);
                  if (justParsed) setJustParsed(false);
                  setErrorMsg(null);
                  if (submitSuccessMsg) setSubmitSuccessMsg(null);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border border-gray-200/90 bg-[#f4f7f5] px-3 py-1 text-left text-xs font-semibold text-gray-700 hover:bg-[#e8f5ee] hover:border-emerald-300 hover:text-emerald-900 transition-all cursor-pointer shadow-2xs whitespace-pre-line"
              >
                &ldquo;{sample.displayText}&rdquo;
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

        {submitSuccessMsg ? (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-900 shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <span className="text-base text-emerald-600">✓</span>
              <span>{submitSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSubmitSuccessMsg(null)}
              aria-label="Dismiss message"
              className="rounded-lg p-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-200/50 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={isParseButtonDisabled}
        >
          {loading
            ? labels.parsingButton
            : isPromptUnchanged
              ? labels.parsedSuccessButton ||
                (locale === "bn" ? "✓ যুক্ত হয়েছে" : "✓ Added")
              : labels.parseButton}
        </Button>
      </form>

      {/* Confirm UI: Multi-item editable rows list (NEVER auto-saves) */}
      {items.length > 0 ? (
        <form
          ref={confirmSectionRef}
          id="confirm-section"
          onSubmit={handleBatchSubmit}
          className="space-y-4 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-surface-muted)] p-4 sm:p-5 shadow-xs scroll-mt-6"
        >
          {/* New Section Feedback Banner */}
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 sm:p-3.5 text-xs sm:text-sm font-bold text-emerald-950 shadow-2xs">
            <span className="flex items-center gap-1.5">
              <span>👇</span>
              <span>
                {labels.newSectionIndicator
                  ? labels.newSectionIndicator.replace(
                      "{count}",
                      String(items.length),
                    )
                  : locale === "bn"
                    ? `নিচের ${items.length}টি খরচ তৈরি হয়েছে, দেখে নিন`
                    : `Review the ${items.length} drafted expenses below`}
              </span>
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
              {labels.newSectionBadge ||
                (locale === "bn" ? "নতুন তৈরি" : "New Draft")}
            </span>
          </div>

          {/* Header */}
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
              onClick={handleDiscardAll}
              className="text-xs font-semibold text-red-700 hover:text-red-900 underline cursor-pointer"
            >
              {labels.discardDraftButton}
            </button>
          </div>

          {/* AI Fallback Notice Banner */}
          {parseSource === "fallback" ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs font-semibold text-neutral-700 flex items-center gap-2">
              <span className="text-sm">💡</span>
              <span>
                {labels.fallbackNotice ||
                  (locale === "bn"
                    ? "লোকাল পার্সার দিয়ে তৈরি হয়েছে, মিলিয়ে নিন"
                    : "Drafted with local parser, please review")}
              </span>
            </div>
          ) : null}

          {/* Rows List */}
          <div className="space-y-3.5">
            {items.map((item, index) => {
              const isHighlight =
                item.confidence !== "high" ||
                item.amount === null ||
                item.amount <= 0 ||
                Boolean(item.question) ||
                item.needsAttention;

              return (
                <div
                  key={item.id}
                  className={`space-y-3 rounded-2xl border p-4 sm:p-4.5 transition-all shadow-xs ${
                    isHighlight
                      ? "border-amber-300 bg-amber-50/40 ring-1 ring-amber-300/50"
                      : "border-[var(--color-border)] bg-white"
                  }`}
                >
                  {/* Row Header with Item #, Status Badges, and Remove Button */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-xs font-extrabold text-neutral-800">
                        {index + 1}
                      </span>
                      {item.isSettlement ? (
                        <span className="inline-block rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 border border-purple-200">
                          {locale === "bn" ? "লেনদেন" : "Settlement"}
                        </span>
                      ) : null}
                      {item.confidence !== "high" || item.needsAttention ? (
                        <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 border border-amber-200">
                          {locale === "bn" ? "দেখে নিন" : "Needs review"}
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove item"
                      className="rounded-lg p-1 text-xs font-bold text-neutral-400 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      ✕ {locale === "bn" ? "মুছুন" : "Remove"}
                    </button>
                  </div>

                  {/* Open Question Banner with Resolve Button */}
                  {item.question ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs font-semibold text-amber-950">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">❓</span>
                        <span>{item.question}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => resolveQuestion(item.id)}
                        className="shrink-0 rounded-lg bg-amber-200 hover:bg-amber-300 px-2.5 py-1 text-xs font-bold text-amber-900 cursor-pointer shadow-2xs"
                      >
                        {locale === "bn" ? "ঠিক আছে" : "Got it"}
                      </button>
                    </div>
                  ) : null}

                  {/* Title & Amount Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    {/* Title */}
                    <div className="sm:col-span-8 space-y-1">
                      <label
                        htmlFor={`title-${item.id}`}
                        className="block text-xs font-bold text-[var(--color-fg)]"
                      >
                        {labels.titleLabel}
                      </label>
                      <input
                        id={`title-${item.id}`}
                        type="text"
                        required
                        maxLength={100}
                        value={item.title}
                        onChange={(e) =>
                          updateItem(item.id, { title: e.target.value })
                        }
                        placeholder={
                          locale === "bn" ? "কিসের খরচ?" : "Expense title"
                        }
                        className="min-h-[42px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                      />
                    </div>

                    {/* Amount */}
                    <div className="sm:col-span-4 space-y-1">
                      <label
                        htmlFor={`amount-${item.id}`}
                        className="block text-xs font-bold text-[var(--color-fg)]"
                      >
                        {labels.amountLabel}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--color-primary)]">
                          ৳
                        </span>
                        <input
                          id={`amount-${item.id}`}
                          type="text"
                          inputMode="numeric"
                          required
                          value={item.amountStr}
                          onChange={(e) =>
                            handleAmountChange(item.id, e.target.value)
                          }
                          placeholder="0"
                          className={`min-h-[42px] w-full rounded-xl border bg-white pl-8 pr-3 py-2 text-sm font-bold text-[var(--color-primary)] outline-none ${
                            item.amount === null || item.amount <= 0
                              ? "border-red-400 ring-1 ring-red-300"
                              : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                          }`}
                        />
                      </div>
                      {item.amount === null || item.amount <= 0 ? (
                        <p className="text-[11px] font-bold text-red-600">
                          {locale === "bn"
                            ? "টাকার পরিমাণ লিখুন"
                            : "Enter amount"}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Category, Who Paid & Date: 3 rows for all devices */}
                  <div className="grid grid-cols-1 gap-3">
                    {/* Category */}
                    <div className="space-y-1">
                      <SelectField
                        id={`category-${item.id}`}
                        name={`category_${item.id}`}
                        value={item.category}
                        onChange={(val) =>
                          updateItem(item.id, {
                            category: val as ExpenseCategoryValue,
                          })
                        }
                        label={labels.categoryLabel}
                        options={(
                          Object.keys(
                            labels.categories,
                          ) as ExpenseCategoryValue[]
                        ).map((cat) => ({
                          value: cat,
                          label: labels.categories[cat],
                        }))}
                      />
                    </div>

                    {/* Who Paid */}
                    <div className="space-y-1">
                      <SelectField
                        id={`paidBy-${item.id}`}
                        name={`paidBy_${item.id}`}
                        value={item.paidById}
                        onChange={(val) =>
                          updateItem(item.id, { paidById: val })
                        }
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

                    {/* Date */}
                    <div className="space-y-1">
                      <DatePickerField
                        id={`date-${item.id}`}
                        name={`date_${item.id}`}
                        value={item.dateYyyyMmDd}
                        onChange={(val) =>
                          updateItem(item.id, { dateYyyyMmDd: val })
                        }
                        label={labels.dateLabel}
                        locale={locale}
                        required
                        showQuickPills={false}
                      />
                    </div>
                  </div>

                  {/* Shared by participants */}
                  <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-gray-50/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--color-fg)]">
                        {labels.participantsLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSelectAllParticipants(item.id)}
                        className="rounded-lg px-2 py-0.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/40 transition-colors cursor-pointer"
                      >
                        {item.participantIds.length === members.length
                          ? locale === "bn"
                            ? "সবাই মুছুন"
                            : "Clear all"
                          : locale === "bn"
                            ? "সবাই"
                            : labels.selectAll}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {members.map((m) => {
                        const checked = item.participantIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleParticipant(item.id, m.id)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 ${
                              checked
                                ? "bg-[var(--color-primary)] text-white font-bold shadow-2xs"
                                : "border border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                            }`}
                          >
                            <span>{m.emoji ?? "🎒"}</span>
                            <span>{m.displayName}</span>
                          </button>
                        );
                      })}
                    </div>

                    {item.participantIds.length === 0 ? (
                      <p className="text-xs font-medium text-red-600">
                        {locale === "bn"
                          ? "কমপক্ষে একজন সদস্য নির্বাচন করুন।"
                          : "Select at least one participant."}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Another Row Button */}
          <div>
            <button
              type="button"
              onClick={addNewRow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-primary)]/60 bg-white px-3.5 py-2 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/30 transition-all cursor-pointer"
            >
              <span>+</span>
              <span>
                {locale === "bn"
                  ? "আরেকটি খরচ যোগ করুন"
                  : "Add another expense"}
              </span>
            </button>
          </div>

          {/* Footer: Count & Total, Submit Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <div className="text-sm font-bold text-[var(--color-fg)]">
              {locale === "bn"
                ? `${items.length} টি খরচ, মোট ${formatTaka(totalTaka, locale)}`
                : `${items.length} expenses, total ${formatTaka(totalTaka, locale)}`}
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitDisabled}
              className="min-h-[44px] font-bold"
            >
              {submitting
                ? locale === "bn"
                  ? "সেভ হচ্ছে..."
                  : "Saving..."
                : locale === "bn"
                  ? `✓ সবগুলো যোগ করুন (${items.length})`
                  : `✓ Add all (${items.length})`}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
