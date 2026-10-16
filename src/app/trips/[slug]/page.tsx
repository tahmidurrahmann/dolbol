import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  addGuestMemberAction,
  joinTripAction,
  reclaimMemberAction,
  renameMemberAction,
  switchDeviceMemberAction,
  toggleTripLockAction,
} from "@/app/trips/actions";
import { ActivityLogCard } from "@/components/ActivityLogCard";
import { AiExpenseParserCard } from "@/components/AiExpenseParserCard";
import { BalancesCard } from "@/components/BalancesCard";
import { Button } from "@/components/Button";
import { DestinationVotingCard } from "@/components/DestinationVotingCard";
import {
  type EditableExpenseData,
  type ExistingExpenseSummary,
  ExpenseFormCard,
} from "@/components/ExpenseFormCard";
import { ItineraryCard } from "@/components/ItineraryCard";
import { PerDayExpensesView } from "@/components/PerDayExpensesView";
import { SettlementsCard } from "@/components/SettlementsCard";
import { ShareLinkCard } from "@/components/ShareLinkCard";
import { TripTabsContainer } from "@/components/TripTabsContainer";
import { db } from "@/lib/db";
import {
  formatDate,
  formatTaka,
  type SupportedLocale,
  toBanglaDigits,
} from "@/lib/format";
import {
  computeMemberBalances,
  type ExpenseCategoryValue,
  type ExpenseRecordInput,
  groupExpensesByDhakaDay,
  type MemberInput,
  type SettlementRecordInput,
  simplifyDebts,
  type SplitTypeValue,
} from "@/lib/money";
import { groupItineraryByDay, summarizeDestinationVotes } from "@/lib/planning";
import type { ActivityLogRecordInput, ActivityLogSnapshot } from "@/lib/safety";
import { getCurrentMemberForTrip } from "@/lib/session";
import { dayKey } from "@/lib/time";
import { MEMBER_EMOJIS } from "@/lib/trips";

interface TripPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; editExpense?: string }>;
}

type ErrorKey =
  | "invalid_input"
  | "invalid_pin"
  | "wrong_pin"
  | "duplicate_name"
  | "trip_not_found"
  | "trip_locked"
  | "not_creator"
  | "invalid_amount"
  | "invalid_shares"
  | "same_member_settlement"
  | "unauthorized"
  | "duplicate_expense_warning"
  | "cross_trip_option"
  | "duplicate_option";

const ERROR_KEYS = new Set<ErrorKey>([
  "invalid_input",
  "invalid_pin",
  "wrong_pin",
  "duplicate_name",
  "trip_not_found",
  "trip_locked",
  "not_creator",
  "invalid_amount",
  "invalid_shares",
  "same_member_settlement",
  "unauthorized",
  "duplicate_expense_warning",
  "cross_trip_option",
  "duplicate_option",
]);

function asSnapshot(val: unknown): ActivityLogSnapshot | null {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as ActivityLogSnapshot;
  }
  return null;
}

export default async function TripPage({
  params,
  searchParams,
}: TripPageProps) {
  const { slug } = await params;
  const { error, editExpense } = await searchParams;
  const locale = (await getLocale()) as SupportedLocale;

  const trip = await db.trip.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
      expenses: {
        where: { deletedAt: null },
        include: { shares: true },
        orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
      },
      settlements: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
      options: {
        orderBy: { createdAt: "asc" },
      },
      votes: true,
      itinerary: {
        orderBy: [
          { dayNumber: "asc" },
          { position: "asc" },
          { createdAt: "asc" },
        ],
      },
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 60,
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  const tWho = await getTranslations("whoAreYou");
  const tTrip = await getTranslations("tripPage");
  const tMoney = await getTranslations("money");
  const tAi = await getTranslations("aiParser");
  const tPlan = await getTranslations("planning");
  const tErr = await getTranslations("errors");

  const errorMessage =
    error && ERROR_KEYS.has(error as ErrorKey) ? tErr(error as ErrorKey) : null;

  const isLocked = Boolean(trip.lockedAt);
  const reclaimableMembers = trip.members.filter((m) => !m.isGuest);

  // 1. If device has no active session for this trip, show the "Who are you?" screen
  if (!currentMember) {
    return (
      <section className="space-y-6 py-4 max-w-xl mx-auto">
        <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌴</span>
              <h1 className="text-2xl font-black text-[var(--color-fg)] tracking-tight">
                {trip.name}
              </h1>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isLocked
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
              }`}
            >
              {isLocked ? `🔒 ${tTrip("lockedBadge")}` : `🟢 ${tTrip("unlockedBadge")}`}
            </span>
          </div>
          {trip.destination ? (
            <p className="text-sm font-medium text-[var(--color-fg-muted)] flex items-center gap-1">
              <span>📍 {tTrip("destinationPrefix")}</span>
              <span className="font-semibold text-[var(--color-fg)]">{trip.destination}</span>
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900 shadow-2xs"
          >
            <span className="text-lg">⚠️</span>
            <div className="flex-1">{errorMessage}</div>
          </div>
        ) : null}

        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-2xl font-black text-[var(--color-fg)] tracking-tight">
            {tWho("title")}
          </h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {tWho("subtitle")}
          </p>
        </div>

        {/* Reclaim existing member section */}
        {reclaimableMembers.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-lg">🙋</span>
              <h3 className="text-base font-bold text-[var(--color-fg)]">
                {tWho("reclaimTitle")}
              </h3>
            </div>

            <div className="space-y-2.5">
              {reclaimableMembers.map((member) => {
                const hasPin = Boolean(member.pinHash);
                return (
                  <form
                    key={member.id}
                    action={reclaimMemberAction}
                    className="flex flex-col gap-2.5 rounded-xl border border-[var(--color-border)] bg-white p-3.5 shadow-2xs hover:border-[var(--color-primary)]/40 transition-colors"
                  >
                    <input type="hidden" name="slug" value={trip.slug} />
                    <input type="hidden" name="memberId" value={member.id} />

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-[var(--color-fg)]">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] text-lg">
                          {member.emoji ?? "🎒"}
                        </span>
                        <span>{member.displayName}</span>
                        {member.id === trip.creatorMemberId ? (
                          <span className="rounded-md bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]">
                            {tTrip("creatorBadge")}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-medium text-[var(--color-fg-muted)]">
                        {hasPin
                          ? `🔒 ${tWho("pinProtected")}`
                          : tWho("noPinSet")}
                      </span>
                    </div>

                    {hasPin ? (
                      <div className="flex gap-2 pt-1">
                        <input
                          name="pin"
                          type="password"
                          inputMode="numeric"
                          required
                          maxLength={6}
                          placeholder={tWho("enterPinPlaceholder")}
                          className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
                        >
                          {tWho("reclaimButton")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
                      >
                        {tWho("reclaimButton")}
                      </button>
                    )}
                  </form>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Join as a new member section */}
        <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <h3 className="text-base font-bold text-[var(--color-fg)]">
              {tWho("newMemberTitle")}
            </h3>
          </div>

          {isLocked ? (
            <p className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-fg-muted)]">
              {tWho("lockedNotice")}
            </p>
          ) : (
            <form action={joinTripAction} className="space-y-4">
              <input type="hidden" name="slug" value={trip.slug} />

              <div className="space-y-1.5">
                <label
                  htmlFor="displayName"
                  className="block text-sm font-bold text-[var(--color-fg)]"
                >
                  {tWho("yourNameLabel")}{" "}
                  <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  minLength={1}
                  maxLength={40}
                  placeholder={tWho("yourNamePlaceholder")}
                  className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-sm font-bold text-[var(--color-fg)]">
                  {tWho("emojiLabel")}
                </legend>
                <div className="grid grid-cols-6 gap-2 pt-1">
                  {MEMBER_EMOJIS.map((emoji, index) => (
                    <label
                      key={emoji}
                      className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-xl has-[:checked]:border-2 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-light)]/40 hover:bg-[var(--color-surface-muted)] transition-all"
                    >
                      <input
                        type="radio"
                        name="emoji"
                        value={emoji}
                        defaultChecked={index === 0}
                        className="sr-only"
                      />
                      <span>{emoji}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="pin"
                    className="block text-sm font-bold text-[var(--color-fg)]"
                  >
                    {tWho("pinLabel")}
                  </label>
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {locale === "bn"
                      ? "(ঐচ্ছিক - ৪-৬ ডিজিট)"
                      : "(Optional - 4-6 digits)"}
                  </span>
                </div>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={tWho("pinPlaceholder")}
                  className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>

              <Button type="submit" variant="primary">
                {tWho("joinButton")}
              </Button>
            </form>
          )}
        </div>
      </section>
    );
  }

  // 2. Signed-in Trip Hub View + Steps 3, 4, 5 & 6
  const isCreator = currentMember.id === trip.creatorMemberId;
  const memberCountLabel =
    locale === "bn"
      ? toBanglaDigits(trip.members.length)
      : String(trip.members.length);

  const memberInputs: MemberInput[] = trip.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    emoji: m.emoji,
    isGuest: m.isGuest,
  }));

  const expenseInputs: ExpenseRecordInput[] = trip.expenses.map((e) => ({
    id: e.id,
    title: e.title,
    amount: e.amount,
    category: e.category as ExpenseCategoryValue,
    expenseDate: e.expenseDate,
    paidById: e.paidById,
    createdById: e.createdById,
    splitType: e.splitType as SplitTypeValue,
    note: e.note,
    deletedAt: e.deletedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      amount: s.amount,
    })),
  }));

  const existingExpenseSummaries: ExistingExpenseSummary[] = expenseInputs.map(
    (e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      expenseDateYyyyMmDd: dayKey(e.expenseDate),
      paidById: e.paidById,
    }),
  );

  const settlementInputs: SettlementRecordInput[] = trip.settlements.map(
    (s) => ({
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: s.amount,
      createdById: s.createdById,
      deletedAt: s.deletedAt,
      createdAt: s.createdAt,
    }),
  );

  const activityLogInputs: ActivityLogRecordInput[] = trip.activityLogs.map(
    (log) => ({
      id: log.id,
      tripId: log.tripId,
      memberId: log.memberId,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      before: asSnapshot(log.before),
      after: asSnapshot(log.after),
      createdAt: log.createdAt,
    }),
  );

  const totalTripSpend = expenseInputs.reduce((sum, e) => sum + e.amount, 0);
  const balances = computeMemberBalances({
    members: memberInputs,
    expenses: expenseInputs,
    settlements: settlementInputs,
  });
  const simplifiedDebts = simplifyDebts(balances);

  const dayGroups = groupExpensesByDhakaDay({
    expenses: expenseInputs,
    members: memberInputs,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    locale,
    otherDatesLabel: tMoney("otherDatesLabel"),
  });

  const voteSummary = summarizeDestinationVotes({
    options: trip.options,
    votes: trip.votes,
    members: memberInputs,
    currentMemberId: currentMember.id,
  });

  const itineraryDayGroups = groupItineraryByDay({
    items: trip.itinerary,
    tripStartDate: trip.startDate,
    locale,
  });

  const targetEditExpense = editExpense
    ? expenseInputs.find((e) => e.id === editExpense)
    : undefined;

  const editingExpenseData: EditableExpenseData | null = targetEditExpense
    ? {
        id: targetEditExpense.id,
        title: targetEditExpense.title,
        amount: targetEditExpense.amount,
        category: targetEditExpense.category,
        expenseDateYyyyMmDd: dayKey(targetEditExpense.expenseDate),
        paidById: targetEditExpense.paidById,
        splitType: targetEditExpense.splitType,
        note: targetEditExpense.note ?? null,
        shares: targetEditExpense.shares,
      }
    : null;

  const categoryLabels: Record<ExpenseCategoryValue, string> = {
    TRANSPORT: tMoney("cat_TRANSPORT"),
    HOTEL: tMoney("cat_HOTEL"),
    FOOD: tMoney("cat_FOOD"),
    TICKET: tMoney("cat_TICKET"),
    OTHER: tMoney("cat_OTHER"),
  };

  const defaultExpenseDate = dayKey(trip.startDate ?? new Date());

  return (
    <section className="space-y-5 py-2">
      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900 shadow-2xs"
        >
          <span className="text-lg">⚠️</span>
          <div className="flex-1">{errorMessage}</div>
        </div>
      ) : null}

      {/* Modern Trip Header Card with Key Metrics Bar */}
      <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-fg)] tracking-tight">
                {trip.name}
              </h1>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isLocked
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                }`}
              >
                {isLocked ? `🔒 ${tTrip("lockedBadge")}` : `🟢 ${tTrip("unlockedBadge")}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-fg-muted)]">
              {trip.destination ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-fg)]">
                  📍 {trip.destination}
                </span>
              ) : null}
              {trip.destination && (trip.startDate || trip.endDate) ? (
                <span>•</span>
              ) : null}
              {trip.startDate || trip.endDate ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  🗓️ {trip.startDate ? formatDate(trip.startDate, locale) : ""}{" "}
                  {trip.startDate && trip.endDate ? "—" : ""}{" "}
                  {trip.endDate ? formatDate(trip.endDate, locale) : ""}
                </span>
              ) : null}
            </div>
          </div>

          <form action={switchDeviceMemberAction}>
            <input type="hidden" name="slug" value={trip.slug} />
            <button
              type="submit"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-fg)] shadow-2xs hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              <span>🔄</span>
              <span>{tTrip("switchDevice")}</span>
            </button>
          </form>
        </div>

        {/* Quick summary stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--color-border)]">
          <div className="rounded-xl bg-[var(--color-primary-light)]/40 p-3 border border-[var(--color-primary)]/15">
            <span className="text-xs font-semibold text-[var(--color-fg-muted)] block">
              {tMoney("totalTripSpend")}
            </span>
            <span className="text-xl sm:text-2xl font-black text-[var(--color-primary)]">
              {formatTaka(totalTripSpend, locale)}
            </span>
          </div>

          <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 border border-[var(--color-border)]">
            <span className="text-xs font-semibold text-[var(--color-fg-muted)] block">
              {tTrip("membersHeading")}
            </span>
            <span className="text-lg sm:text-xl font-bold text-[var(--color-fg)]">
              👥 {memberCountLabel} {locale === "bn" ? "জন" : "members"}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl bg-[var(--color-surface-muted)] p-3 border border-[var(--color-border)] flex flex-col justify-center">
            <span className="text-xs font-semibold text-[var(--color-fg-muted)] block">
              {tTrip("signedInAs")}
            </span>
            <span className="text-sm font-bold text-[var(--color-fg)] truncate">
              {currentMember.emoji ?? "🎒"} {currentMember.displayName}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Container: Expenses, Balances, Plan, Members */}
      <TripTabsContainer
        locale={locale}
        initialTab={editExpense ? "expenses" : "expenses"}
        expensesSlot={
          <>
            {/* Step 6: AI Expense Parser (Bangla + Banglish -> Confirm Card -> Save) */}
            {!isLocked ? (
              <AiExpenseParserCard
                slug={trip.slug}
                members={memberInputs}
                defaultDateYyyyMmDd={defaultExpenseDate}
                existingExpenses={existingExpenseSummaries}
                labels={{
                  cardTitle: tAi("cardTitle"),
                  cardSubtitle: tAi("cardSubtitle"),
                  inputPlaceholder: tAi("inputPlaceholder"),
                  tryExamplesLabel: tAi("tryExamplesLabel"),
                  parseButton: tAi("parseButton"),
                  parsingButton: tAi("parsingButton"),
                  confirmCardBadge: tAi("confirmCardBadge"),
                  confirmCardNote: tAi("confirmCardNote"),
                  rawInputLabel: tAi("rawInputLabel"),
                  titleLabel: tMoney("titleLabel"),
                  amountLabel: tMoney("amountLabel"),
                  categoryLabel: tMoney("categoryLabel"),
                  dateLabel: tMoney("dateLabel"),
                  paidByLabel: tMoney("paidByLabel"),
                  participantsLabel: tMoney("participantsLabel"),
                  selectAll: tMoney("selectAll"),
                  confirmSaveButton: tAi("confirmSaveButton"),
                  discardDraftButton: tAi("discardDraftButton"),
                  duplicateWarningTitle: tMoney("duplicateWarningTitle"),
                  duplicateWarningBody: tMoney("duplicateWarningBody"),
                  confirmDuplicateLabel: tMoney("confirmDuplicateLabel"),
                  errMissingAmount: tAi("errMissingAmount"),
                  errRateLimited: tAi("errRateLimited"),
                  errGeneric: tAi("errGeneric"),
                  categories: categoryLabels,
                }}
              />
            ) : null}

            {/* Step 3.1 + Step 4: Manual Expense Form with Live Duplicate-Entry Warning */}
            {!isLocked ? (
              <div id="expense-form">
                <ExpenseFormCard
                  key={editingExpenseData?.id ?? "new-expense"}
                  slug={trip.slug}
                  members={memberInputs}
                  currentMemberId={currentMember.id}
                  defaultDateYyyyMmDd={defaultExpenseDate}
                  editingExpense={editingExpenseData}
                  existingExpenses={existingExpenseSummaries}
                  forceShowDuplicateConfirm={error === "duplicate_expense_warning"}
                  labels={{
                    addExpenseTitle: tMoney("addExpenseTitle"),
                    editExpenseTitle: tMoney("editExpenseTitle"),
                    cancelEdit: tMoney("cancelEdit"),
                    titleLabel: tMoney("titleLabel"),
                    titlePlaceholder: tMoney("titlePlaceholder"),
                    amountLabel: tMoney("amountLabel"),
                    amountPlaceholder: tMoney("amountPlaceholder"),
                    categoryLabel: tMoney("categoryLabel"),
                    dateLabel: tMoney("dateLabel"),
                    paidByLabel: tMoney("paidByLabel"),
                    splitTypeLabel: tMoney("splitTypeLabel"),
                    splitEqual: tMoney("splitEqual"),
                    splitExact: tMoney("splitExact"),
                    splitPercent: tMoney("splitPercent"),
                    participantsLabel: tMoney("participantsLabel"),
                    selectAll: tMoney("selectAll"),
                    leftoverNote: tMoney("leftoverNote"),
                    exactSumStatus: tMoney("exactSumStatus"),
                    percentSumStatus: tMoney("percentSumStatus"),
                    noteLabel: tMoney("noteLabel"),
                    notePlaceholder: tMoney("notePlaceholder"),
                    saveExpenseButton: tMoney("saveExpenseButton"),
                    updateExpenseButton: tMoney("updateExpenseButton"),
                    duplicateWarningTitle: tMoney("duplicateWarningTitle"),
                    duplicateWarningBody: tMoney("duplicateWarningBody"),
                    confirmDuplicateLabel: tMoney("confirmDuplicateLabel"),
                    categories: categoryLabels,
                  }}
                />
              </div>
            ) : null}

            {/* Step 3.3 + Step 4: Per-Day View with Edit History & Post-Settlement Flagging */}
            <PerDayExpensesView
              slug={trip.slug}
              locale={locale}
              isLocked={isLocked}
              members={memberInputs}
              dayGroups={dayGroups}
              settlements={settlementInputs}
              activityLogs={activityLogInputs}
              labels={{
                perDayTitle: tMoney("perDayTitle"),
                noExpensesYet: tMoney("noExpensesYet"),
                dayTotalLabel: tMoney("dayTotalLabel"),
                perPersonDayCostLabel: tMoney("perPersonDayCostLabel"),
                paidByPrefix: tMoney("paidByPrefix"),
                editedAfterSettlementBadge: tMoney("editedAfterSettlementBadge"),
                editHistoryToggle: tMoney("editHistoryToggle"),
                editedByPrefix: tMoney("editedByPrefix"),
                editButton: tMoney("editButton"),
                deleteButton: tMoney("deleteButton"),
                categories: categoryLabels,
              }}
            />
          </>
        }
        balancesSlot={
          <>
            {/* Step 3.2: Balances Computed on Read & Simplified Debts */}
            <BalancesCard
              locale={locale}
              totalTripSpend={totalTripSpend}
              balances={balances}
              simplifiedDebts={simplifiedDebts}
              labels={{
                balancesTitle: tMoney("balancesTitle"),
                totalTripSpend: tMoney("totalTripSpend"),
                whoOwesWhomTitle: tMoney("whoOwesWhomTitle"),
                allSettled: tMoney("allSettled"),
                owesArrow: tMoney("owesArrow"),
                memberBalancesSub: tMoney("memberBalancesSub"),
                colMember: tMoney("colMember"),
                colPaid: tMoney("colPaid"),
                colOwed: tMoney("colOwed"),
                colNet: tMoney("colNet"),
                statusGets: tMoney("statusGets"),
                statusOwes: tMoney("statusOwes"),
                statusEven: tMoney("statusEven"),
              }}
            />

            {/* Step 3.4: Settlements (Repayments, separate from expenses) */}
            <SettlementsCard
              slug={trip.slug}
              locale={locale}
              isLocked={isLocked}
              currentMemberId={currentMember.id}
              members={memberInputs}
              settlements={settlementInputs}
              labels={{
                settlementsTitle: tMoney("settlementsTitle"),
                settlementSubtitle: tMoney("settlementSubtitle"),
                fromMemberLabel: tMoney("fromMemberLabel"),
                toMemberLabel: tMoney("toMemberLabel"),
                settlementAmountLabel: tMoney("settlementAmountLabel"),
                recordSettlementButton: tMoney("recordSettlementButton"),
                recordedSettlementsList: tMoney("recordedSettlementsList"),
                paidBackText: tMoney("paidBackText"),
                toText: tMoney("toText"),
                deleteButton: tMoney("deleteButton"),
              }}
            />
          </>
        }
        planSlot={
          <>
            {/* Step 5.1: Destination Voting (1 vote per member) */}
            <DestinationVotingCard
              slug={trip.slug}
              locale={locale}
              isLocked={isLocked}
              isCreator={isCreator}
              currentTripDestination={trip.destination}
              options={voteSummary.options}
              labels={{
                votingTitle: tPlan("votingTitle"),
                votingSubtitle: tPlan("votingSubtitle"),
                noOptionsYet: tPlan("noOptionsYet"),
                optionPlaceholder: tPlan("optionPlaceholder"),
                addOptionButton: tPlan("addOptionButton"),
                voteButton: tPlan("voteButton"),
                votedBadge: tPlan("votedBadge"),
                topPickBadge: tPlan("topPickBadge"),
                proposedByPrefix: tPlan("proposedByPrefix"),
                votesCountSuffix: tPlan("votesCountSuffix"),
                setAsDestinationButton: tPlan("setAsDestinationButton"),
              }}
            />

            {/* Step 5.2: Day-by-Day Itinerary */}
            <ItineraryCard
              slug={trip.slug}
              isLocked={isLocked}
              dayGroups={itineraryDayGroups}
              labels={{
                itineraryTitle: tPlan("itineraryTitle"),
                itinerarySubtitle: tPlan("itinerarySubtitle"),
                noItineraryYet: tPlan("noItineraryYet"),
                dayNumberLabel: tPlan("dayNumberLabel"),
                timeLabel: tPlan("timeLabel"),
                timePlaceholder: tPlan("timePlaceholder"),
                activityTitleLabel: tPlan("activityTitleLabel"),
                activityTitlePlaceholder: tPlan("activityTitlePlaceholder"),
                activityNotesLabel: tPlan("activityNotesLabel"),
                activityNotesPlaceholder: tPlan("activityNotesPlaceholder"),
                addItineraryButton: tPlan("addItineraryButton"),
                moveUp: tPlan("moveUp"),
                moveDown: tPlan("moveDown"),
                deleteItem: tPlan("deleteItem"),
              }}
            />
          </>
        }
        membersSlot={
          <>
            {/* Shareable invite link card */}
            <ShareLinkCard
              slug={trip.slug}
              tripName={trip.name}
              shareTitle={tTrip("shareTitle")}
              shareSubtitle={tTrip("shareSubtitle")}
              copyLabel={tTrip("copyLink")}
              copiedLabel={tTrip("copied")}
              shareNativeLabel={tTrip("shareNative")}
            />

            {/* Members list */}
            <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--color-fg)]">
                  {tTrip("membersHeading")} ({memberCountLabel})
                </h2>
              </div>

              <ul className="divide-y divide-[var(--color-border)]">
                {trip.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-2 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-xl">
                        {member.emoji ?? "🎒"}
                      </span>
                      <span className="font-bold text-[var(--color-fg)]">
                        {member.displayName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {member.id === trip.creatorMemberId ? (
                        <span className="rounded-md bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]">
                          {tTrip("creatorBadge")}
                        </span>
                      ) : null}
                      {member.isGuest ? (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {tTrip("guestBadge")}
                        </span>
                      ) : null}
                      {member.pinHash ? (
                        <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-muted)]">
                          🔒 {tTrip("pinSetBadge")}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Creator Controls (visible only to trip creator) */}
            {isCreator ? (
              <div className="space-y-5 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
                <h2 className="text-lg font-bold text-[var(--color-primary)] flex items-center gap-2">
                  <span>👑</span>
                  <span>{tTrip("creatorControlsTitle")}</span>
                </h2>

                {/* Add Guest Form */}
                {!isLocked ? (
                  <form action={addGuestMemberAction} className="space-y-2.5">
                    <input type="hidden" name="slug" value={trip.slug} />
                    <label
                      htmlFor="guestDisplayName"
                      className="block text-sm font-bold text-[var(--color-fg)]"
                    >
                      {tTrip("addGuestTitle")}{" "}
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    <div className="flex gap-2">
                      <select
                        name="emoji"
                        aria-label="Guest emoji"
                        defaultValue="👤"
                        className="min-h-[44px] rounded-xl border border-[var(--color-border)] bg-white px-2.5 text-lg"
                      >
                        <option value="👤">👤</option>
                        {MEMBER_EMOJIS.map((emoji) => (
                          <option key={emoji} value={emoji}>
                            {emoji}
                          </option>
                        ))}
                      </select>
                      <input
                        id="guestDisplayName"
                        name="displayName"
                        type="text"
                        required
                        maxLength={40}
                        placeholder={tTrip("guestNamePlaceholder")}
                        className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                      />
                      <button
                        type="submit"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
                      >
                        {tTrip("addGuestButton")}
                      </button>
                    </div>
                  </form>
                ) : null}

                {/* Rename / Update Emoji per Member */}
                {!isLocked ? (
                  <div className="space-y-2.5 border-t border-[var(--color-border)] pt-4">
                    <h3 className="text-sm font-bold text-[var(--color-fg)]">
                      {tTrip("renameTitle")}
                    </h3>
                    <div className="space-y-2">
                      {trip.members.map((member) => (
                        <form
                          key={member.id}
                          action={renameMemberAction}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <select
                            name="emoji"
                            aria-label={`Emoji for ${member.displayName}`}
                            defaultValue={member.emoji ?? "🎒"}
                            className="min-h-[44px] rounded-xl border border-[var(--color-border)] bg-white px-2.5 text-lg"
                          >
                            <option value="👤">👤</option>
                            {MEMBER_EMOJIS.map((emoji) => (
                              <option key={emoji} value={emoji}>
                                {emoji}
                              </option>
                            ))}
                          </select>
                          <input
                            name="displayName"
                            type="text"
                            required
                            maxLength={40}
                            defaultValue={member.displayName}
                            className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--color-fg)] hover:bg-[var(--color-border)] transition-colors"
                          >
                            {tTrip("renameSaveButton")}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Lock / Unlock Trip Toggle */}
                <form
                  action={toggleTripLockAction}
                  className="space-y-2.5 border-t border-[var(--color-border)] pt-4"
                >
                  <input type="hidden" name="slug" value={trip.slug} />
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    {tTrip("lockTripHint")}
                  </p>
                  <Button type="submit" variant={isLocked ? "primary" : "secondary"}>
                    {isLocked ? tTrip("unlockTripButton") : tTrip("lockTripButton")}
                  </Button>
                </form>
              </div>
            ) : null}

            {/* Step 4: Activity Log & Dispute-Protection Audit Trail */}
            <ActivityLogCard
              locale={locale}
              members={memberInputs}
              activityLogs={activityLogInputs}
              labels={{
                activityLogTitle: tMoney("activityLogTitle"),
                activityLogSubtitle: tMoney("activityLogSubtitle"),
                noActivityYet: tMoney("noActivityYet"),
                act_expense_create: tMoney("act_expense_create"),
                act_expense_update: tMoney("act_expense_update"),
                act_expense_delete: tMoney("act_expense_delete"),
                act_settlement_create: tMoney("act_settlement_create"),
                act_settlement_delete: tMoney("act_settlement_delete"),
                act_member_join: tMoney("act_member_join"),
                act_member_create_guest: tMoney("act_member_create_guest"),
                act_member_update: tMoney("act_member_update"),
                act_trip_create: tMoney("act_trip_create"),
                act_trip_lock: tMoney("act_trip_lock"),
                act_trip_unlock: tMoney("act_trip_unlock"),
              }}
            />

            {/* Placeholder for Step 7 features */}
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
              <h3 className="text-sm font-bold text-[var(--color-fg)]">
                {tTrip("nextStepsTitle")}
              </h3>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                {tTrip("nextStepsBody")}
              </p>
            </div>
          </>
        }
      />
    </section>
  );
}
