import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  addGuestMemberAction,
  claimMemberAction,
  joinTripAction,
  reclaimMemberAction,
  renameMemberAction,
  toggleTripLockAction,
  updateMyProfileAction,
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
import { InviteFriendsCard } from "@/components/InviteFriendsCard";
import { ItineraryCard } from "@/components/ItineraryCard";
import { MembersListCard } from "@/components/MembersListCard";
import { PerDayExpensesView } from "@/components/PerDayExpensesView";
import { SelectField } from "@/components/SelectField";
import { SettlementsCard } from "@/components/SettlementsCard";
import { ShareAndExportCard } from "@/components/ShareAndExportCard";
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
  | "duplicate_option"
  | "member_has_transactions"
  | "cannot_delete_creator";

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
  "member_has_transactions",
  "cannot_delete_creator",
]);

function asSnapshot(val: unknown): ActivityLogSnapshot | null {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as ActivityLogSnapshot;
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const trip = await db.trip.findUnique({
    where: { slug },
    select: { name: true, destination: true },
  });

  const locale = (await getLocale()) as SupportedLocale;

  if (!trip) {
    return {
      title: locale === "bn" ? "ট্রিপ পাওয়া যায়নি" : "Trip Not Found",
    };
  }

  const destinationPart = trip.destination ? ` - ${trip.destination}` : "";
  const pageTitle = `${trip.name}${destinationPart}`;
  const fullTitle = `${pageTitle} | Trip Hub`;
  const description =
    locale === "bn"
      ? `${trip.name} ট্রিপের খরচ ভাগাভাগি ও হিসাব করার জন্য ইনভাইট লিংক।`
      : `Invitation link to join ${trip.name} to track and split expenses.`;

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: trip.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/og-image.png"],
    },
  };
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
        include: {
          sessions: true,
        },
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
  const tShare = await getTranslations("shareExport");
  const tErr = await getTranslations("errors");

  const errorMessage =
    error && ERROR_KEYS.has(error as ErrorKey) ? tErr(error as ErrorKey) : null;

  const isLocked = Boolean(trip.lockedAt);
  const creator = trip.members.find((m) => m.id === trip.creatorMemberId);

  // 1. If device has no active session for this trip, show the streamlined 1-tap Join screen
  if (!currentMember) {
    const unclaimedMembers = trip.members.filter(
      (m) =>
        m.sessions.length === 0 &&
        m.id !== trip.creatorMemberId &&
        !m.pinHash,
    );

    const claimedMembers = trip.members.filter(
      (m) =>
        m.sessions.length > 0 ||
        m.id === trip.creatorMemberId ||
        Boolean(m.pinHash),
    );

    const joinedCount = claimedMembers.length;
    const joinedCountLabel =
      locale === "bn" ? toBanglaDigits(joinedCount) : String(joinedCount);

    return (
      <section className="space-y-5 py-4 max-w-xl mx-auto w-full">
        {/* Header Invitation Card */}
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="text-2xl">🌴</span>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-fg)] tracking-tight">
                {trip.name}
              </h1>
            </div>
            {isLocked ? (
              <span className="self-center rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900 border border-amber-300">
                🔒 {tTrip("lockedBadge")}
              </span>
            ) : null}
          </div>

          <p className="text-sm font-semibold text-[var(--color-primary)]">
            👋 {creator?.displayName ?? (locale === "bn" ? "আপনার বন্ধু" : "A friend")}{" "}
            {locale === "bn"
              ? "আপনাকে এই ট্রিপে আমন্ত্রণ জানিয়েছেন"
              : "invited you to this trip"}
          </p>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-[var(--color-fg-muted)] pt-1">
            {trip.destination ? (
              <span className="font-semibold text-[var(--color-fg)] flex items-center gap-1">
                📍 {trip.destination}
              </span>
            ) : null}
            {trip.startDate || trip.endDate ? (
              <span>
                🗓️ {trip.startDate ? formatDate(trip.startDate, locale) : ""}{" "}
                {trip.startDate && trip.endDate ? "—" : ""}{" "}
                {trip.endDate ? formatDate(trip.endDate, locale) : ""}
              </span>
            ) : null}
            <span className="font-bold text-[var(--color-fg)]">
              👥 {joinedCountLabel} {locale === "bn" ? "জন যুক্ত আছেন" : "joined"}
            </span>
          </div>
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

        {/* 1-Tap Name Selection for Pre-Added Friends */}
        {unclaimedMembers.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-[var(--color-fg)] flex items-center gap-2">
                <span>👇</span>
                <span>
                  {locale === "bn"
                    ? "আপনার নামের ওপর চাপ দিন:"
                    : "Tap your name below to join:"}
                </span>
              </h2>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {locale === "bn"
                  ? "এক ট্যাপেই আপনি ট্রিপে যুক্ত হয়ে যাবেন।"
                  : "One tap to join instantly without password or PIN."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              {unclaimedMembers.map((member) => (
                <form key={member.id} action={claimMemberAction}>
                  <input type="hidden" name="slug" value={trip.slug} />
                  <input type="hidden" name="memberId" value={member.id} />
                  <button
                    type="submit"
                    className="group w-full flex min-h-[58px] items-center justify-between gap-3 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-white p-3 sm:px-4 sm:py-3.5 text-base font-bold text-[var(--color-fg)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/20 hover:shadow-xs active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--color-primary-light)]/60 text-2xl border border-[var(--color-primary)]/20 shrink-0">
                        {member.emoji ?? "🎒"}
                      </span>
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate text-base font-extrabold text-[var(--color-fg)]">
                          {member.displayName}
                        </span>
                        {member.isGuest ? (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 shrink-0">
                            {locale === "bn" ? "গেস্ট প্রোফাইল" : "Guest profile"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-[#18201a] px-4 py-2 text-xs font-black text-white shadow-2xs shrink-0 group-hover:bg-[#253229] group-hover:scale-105 transition-all">
                      <span>{locale === "bn" ? "আমি এটা" : "This is me"}</span>
                      <span>→</span>
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        ) : null}

        {/* Already Joined Members (Disabled) */}
        {claimedMembers.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/40 p-4">
            <span className="text-xs font-bold text-[var(--color-fg-muted)] block">
              {locale === "bn" ? "ইতিমধ্যে যুক্ত হয়েছেন:" : "Already joined:"}
            </span>
            <div className="flex flex-wrap gap-2">
              {claimedMembers.map((member) => (
                <div
                  key={member.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-fg-muted)] opacity-80"
                >
                  <span>{member.emoji ?? "🎒"}</span>
                  <span>{member.displayName}</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md font-bold">
                    ✓ {locale === "bn" ? "যুক্ত" : "Joined"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* "My name isn't here" Expandable Form */}
        {!isLocked ? (
          <details className="group space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xs">
            <summary className="cursor-pointer list-none font-bold text-sm text-[var(--color-primary)] hover:underline flex items-center justify-between select-none">
              <span>➕ {locale === "bn" ? "আমার নাম এখানে নেই" : "My name isn't here"}</span>
              <span className="transition-transform group-open:rotate-180 text-xs text-[var(--color-fg-muted)]">
                ▼
              </span>
            </summary>

            <form action={joinTripAction} className="pt-3 space-y-3 border-t border-[var(--color-border)]">
              <input type="hidden" name="slug" value={trip.slug} />
              <div className="space-y-1.5">
                <label
                  htmlFor="new-displayName"
                  className="block text-sm font-bold text-[var(--color-fg)]"
                >
                  {locale === "bn" ? "আপনার নাম লিখুন" : "Enter your name"}{" "}
                  <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  id="new-displayName"
                  name="displayName"
                  type="text"
                  required
                  minLength={1}
                  maxLength={40}
                  placeholder={locale === "bn" ? "যেমন: তানভীর" : "e.g., Tanvir"}
                  className="min-h-[48px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-base text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 shadow-xs"
                />
              </div>

              <Button type="submit" variant="primary" className="w-full min-h-[48px] font-bold">
                {locale === "bn" ? "ট্রিপে যুক্ত হোন" : "Join trip"}
              </Button>
            </form>
          </details>
        ) : null}

        {/* Phone reset / Reclaim PIN option (collapsed) */}
        {claimedMembers.some((m) => Boolean(m.pinHash)) ? (
          <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-fg-muted)]">
            <summary className="cursor-pointer hover:underline font-semibold select-none flex items-center justify-between">
              <span>🔑 {locale === "bn" ? "ফোন পরিবর্তন করেছেন? পিন দিয়ে লগইন করুন" : "Changed phone? Rejoin with PIN"}</span>
              <span className="text-[10px]">▼</span>
            </summary>
            <div className="pt-3 space-y-2.5 border-t border-[var(--color-border)] mt-2">
              {claimedMembers
                .filter((m) => Boolean(m.pinHash))
                .map((m) => (
                  <form key={m.id} action={reclaimMemberAction} className="flex gap-2">
                    <input type="hidden" name="slug" value={trip.slug} />
                    <input type="hidden" name="memberId" value={m.id} />
                    <span className="flex items-center text-xs font-bold text-[var(--color-fg)] w-24 truncate">
                      {m.emoji ?? "🎒"} {m.displayName}
                    </span>
                    <input
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      placeholder={locale === "bn" ? "পিন দিন" : "Enter PIN"}
                      className="min-h-[38px] flex-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1 text-xs font-bold text-white"
                    >
                      {locale === "bn" ? "প্রবেশ" : "Go"}
                    </button>
                  </form>
                ))}
            </div>
          </details>
        ) : null}
      </section>
    );
  }

  // 2. Signed-in Trip Hub View
  const isCreator = currentMember.id === trip.creatorMemberId;
  const memberInputs: MemberInput[] = trip.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    emoji: m.emoji,
    isGuest: m.isGuest,
  }));

  const joinedMembersCount = trip.members.filter(
    (m) => m.sessions.length > 0 || m.id === trip.creatorMemberId,
  ).length;

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
  const myBalance = balances.find((b) => b.memberId === currentMember.id);

  const membersWithTransactionsSet = new Set<string>();
  for (const exp of expenseInputs) {
    membersWithTransactionsSet.add(exp.paidById);
    for (const share of exp.shares) {
      membersWithTransactionsSet.add(share.memberId);
    }
  }
  for (const set of settlementInputs) {
    membersWithTransactionsSet.add(set.fromMemberId);
    membersWithTransactionsSet.add(set.toMemberId);
  }
  const membersWithTransactions = Array.from(membersWithTransactionsSet);

  const memberListItems = trip.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    emoji: m.emoji,
    isGuest: m.isGuest,
    sessionsCount: m.sessions.length,
  }));

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

  const canEditTargetExpense =
    Boolean(targetEditExpense) &&
    (currentMember.id === targetEditExpense!.paidById ||
      currentMember.id === targetEditExpense!.createdById ||
      currentMember.id === trip.creatorMemberId);

  const editingExpenseData: EditableExpenseData | null =
    targetEditExpense && canEditTargetExpense
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
    HOTEL: tMoney("cat_HOTEL"),
    FOOD: tMoney("cat_FOOD"),
    TRANSPORT: tMoney("cat_TRANSPORT"),
    TICKET: tMoney("cat_TICKET"),
    OTHER: tMoney("cat_OTHER"),
  };

  const defaultExpenseDate = dayKey(trip.startDate ?? new Date());

  const tripDateRangeLabel =
    trip.startDate || trip.endDate
      ? `${trip.startDate ? formatDate(trip.startDate, locale) : ""} ${trip.startDate && trip.endDate ? "—" : ""} ${trip.endDate ? formatDate(trip.endDate, locale) : ""}`
      : null;

  const statCardsNode = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      {/* Card 1: Total trip cost */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 p-4 sm:p-5 shadow-xs flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--color-primary)]" />
            <span className="text-xs font-extrabold text-neutral-400 uppercase tracking-wider">
              {tTrip("totalTripCost")}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[var(--color-fg)] tracking-tight">
            {formatTaka(totalTripSpend, locale)}
          </div>
          <p className="text-xs text-neutral-400">
            {tTrip("totalTripSpendHint")}
          </p>
        </div>
        <div className="size-12 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center text-2xl shrink-0 shadow-2xs">
          💳
        </div>
      </div>

      {/* Card 2: My balance */}
      {(() => {
        const net = myBalance?.netBalance ?? 0;
        const isPositive = net > 0;
        const isNegative = net < 0;

        const cardBg = isPositive
          ? "bg-gradient-to-br from-emerald-50/90 via-white to-emerald-100/40 border-emerald-300/80"
          : isNegative
            ? "bg-gradient-to-br from-rose-50/90 via-white to-rose-100/40 border-rose-300/80"
            : "bg-gradient-to-br from-slate-50 via-white to-slate-100/50 border-slate-200";

        const badgeBg = isPositive
          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : isNegative
            ? "bg-rose-100 text-rose-800 border-rose-200"
            : "bg-slate-100 text-slate-700 border-slate-200";

        const amountColor = isPositive
          ? "text-emerald-700"
          : isNegative
            ? "text-rose-600"
            : "text-[var(--color-fg)]";

        const badgeText = isPositive
          ? `✓ ${tTrip("youWillGet")}`
          : isNegative
            ? `⚠️ ${tTrip("youOwe")}`
            : `🤝 ${tTrip("allSettled")}`;

        const amountText = isPositive
          ? `+${formatTaka(net, locale)}`
          : isNegative
            ? `-${formatTaka(Math.abs(net), locale)}`
            : formatTaka(0, locale);

        const hintText = isPositive
          ? tTrip("myBalanceGetsHint")
          : isNegative
            ? tTrip("myBalanceOwesHint")
            : tTrip("myBalanceSettledHint");

        const icon = isPositive ? "💰" : isNegative ? "💸" : "🤝";

        return (
          <div
            className={`rounded-2xl border p-4 sm:p-5 shadow-xs flex items-center justify-between ${cardBg}`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeBg}`}
                >
                  {badgeText}
                </span>
              </div>
              <div className={`text-2xl sm:text-3xl font-black tracking-tight ${amountColor}`}>
                {amountText}
              </div>
              <p className="text-xs text-neutral-400">
                {hintText}
              </p>
            </div>
            <div className="size-12 rounded-2xl bg-white text-2xl flex items-center justify-center shrink-0 shadow-2xs border border-[var(--color-border)]">
              {icon}
            </div>
          </div>
        );
      })()}
    </div>
  );

  return (
    <section className="space-y-5 py-2 pb-24 min-[1000px]:pb-4">
      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900 shadow-2xs"
        >
          <span className="text-lg">⚠️</span>
          <div className="flex-1">{errorMessage}</div>
        </div>
      ) : null}

      {/* Header Card */}
      <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl sm:text-2xl">🌴</span>
              <h1 className="text-xl sm:text-3xl font-black text-[var(--color-fg)] tracking-tight">
                {trip.name}
              </h1>
              {isLocked ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-300">
                  🔒 {tTrip("lockedBadge")}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[var(--color-fg-muted)]">
              {trip.destination ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-fg)] bg-[var(--color-surface-muted)] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                  📍 {trip.destination}
                </span>
              ) : null}
              {tripDateRangeLabel ? (
                <span className="inline-flex items-center gap-1 font-medium bg-[var(--color-surface-muted)] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                  🗓️ {tripDateRangeLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-fg)] bg-[var(--color-surface-muted)] px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border border-[var(--color-border)] shadow-2xs">
            <span className="text-base">{currentMember.emoji ?? "🎒"}</span>
            <span className="font-extrabold whitespace-nowrap">
              {currentMember.displayName}
            </span>
          </div>
        </div>

        {/* 2 Stat Cards: Shown in header on desktop (>= 1000px), on mobile moved into Expenses tab */}
        <div className="hidden min-[1000px]:block pt-3 border-t border-[var(--color-border)]">
          {statCardsNode}
        </div>
      </div>

      {/* Prominent Invite Friends Card at TOP for desktop only if < 2 joined members */}
      {joinedMembersCount < 2 ? (
        <div className="hidden min-[1000px]:block">
          <InviteFriendsCard
            slug={trip.slug}
            tripName={trip.name}
            locale={locale}
          />
        </div>
      ) : null}

      {/* Tabs Container: খরচ (Expenses), হিসাব (Who owes whom), প্ল্যান (Plan), বন্ধুরা (Friends) */}
      <TripTabsContainer
        locale={locale}
        initialTab={editExpense ? "expenses" : "expenses"}
        expensesSlot={
          <div className="space-y-5">
            {/* Mobile-only Stat Cards (< 1000px, displayed inside Expenses tab) */}
            <div className="min-[1000px]:hidden">
              {statCardsNode}
            </div>

            <div
              className={
                !isLocked
                  ? "space-y-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0 lg:items-start"
                  : "space-y-5"
              }
            >
              {!isLocked ? (
                <div id="expense-box" className="space-y-5 lg:col-span-5">
                {/* AI Expense Parser Card */}
                <AiExpenseParserCard
                  slug={trip.slug}
                  locale={locale}
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

                {/* Manual Expense Form Card (Collapsible) */}
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
                    locale={locale}
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
                      manualFormToggle: tMoney("manualFormToggle"),
                      manualFormClose: tMoney("manualFormClose"),
                      moreOptionsToggle: tMoney("moreOptionsToggle"),
                      whoPaidLabel: tMoney("whoPaidLabel"),
                      whoSharedLabel: tMoney("whoSharedLabel"),
                    }}
                  />
                </div>
              </div>
            ) : null}

            {/* Per-Day View */}
            <div className={!isLocked ? "space-y-5 lg:col-span-7" : "space-y-5"}>
              <PerDayExpensesView
                slug={trip.slug}
                locale={locale}
                isLocked={isLocked}
                currentMemberId={currentMember.id}
                creatorMemberId={trip.creatorMemberId}
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
            </div>
          </div>
        </div>
      }
        balancesSlot={
          <div className="space-y-5">
            <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
              {/* Balances Card */}
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

              {/* Settlements Card */}
              <SettlementsCard
                slug={trip.slug}
                locale={locale}
                isLocked={isLocked}
                currentMemberId={currentMember.id}
                creatorMemberId={trip.creatorMemberId}
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
            </div>

            {/* Share Card & Printable Cost Sheet (placed under হিসাব / Who owes whom for clear settlement sharing) */}
            <ShareAndExportCard
              slug={trip.slug}
              locale={locale}
              tripName={trip.name}
              destination={trip.destination}
              dateRangeLabel={tripDateRangeLabel}
              members={trip.members.map((m) => ({
                displayName: m.displayName,
                emoji: m.emoji,
                isGuest: m.isGuest,
              }))}
              itineraryHighlights={itineraryDayGroups.flatMap((d) =>
                d.items.map(
                  (item) =>
                    `${locale === "bn" ? `দিন ${toBanglaDigits(d.dayNumber)}` : `Day ${d.dayNumber}`}: ${item.title}`,
                ),
              )}
              labels={{
                cardTitle: tShare("cardTitle"),
                cardSubtitle: tShare("cardSubtitle"),
                publicSummaryTitle: tShare("publicSummaryTitle"),
                publicSummaryHint: tShare("publicSummaryHint"),
                openPublicSummaryButton: tShare("openPublicSummaryButton"),
                copyPublicLinkButton: tShare("copyPublicLinkButton"),
                copiedPublicLink: tShare("copiedPublicLink"),
                shareImageHeading: tShare("shareImageHeading"),
                downloadShareImageButton: tShare("downloadShareImageButton"),
                costSheetTitle: tShare("costSheetTitle"),
                costSheetHint: tShare("costSheetHint"),
                downloadCsvButton: tShare("downloadCsvButton"),
                openPrintableSheetButton: tShare("openPrintableSheetButton"),
              }}
            />
          </div>
        }
        planSlot={
          <div className="space-y-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0 lg:items-start">
            {/* Destination Voting */}
            <div className="space-y-5 lg:col-span-5">
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
            </div>

            {/* Day-by-Day Itinerary */}
            <div className="space-y-5 lg:col-span-7">
              <ItineraryCard
                slug={trip.slug}
                locale={locale}
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
            </div>
          </div>
        }
        membersSlot={
          <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
            <div className="space-y-5">
              {/* Invite Card in Friends tab */}
              <InviteFriendsCard
                slug={trip.slug}
                tripName={trip.name}
                locale={locale}
              />

              {/* Members List */}
              <MembersListCard
                slug={trip.slug}
                locale={locale}
                isCreator={isCreator}
                creatorMemberId={trip.creatorMemberId}
                members={memberListItems}
                membersWithTransactions={membersWithTransactions}
                labels={{
                  heading: tTrip("membersHeading"),
                  creatorBadge: tTrip("creatorBadge"),
                  guestBadge: tTrip("guestBadge"),
                  joinedBadge: tTrip("joinedBadge"),
                  hasTransactionsBadge: tTrip("hasTransactionsBadge"),
                  deleteButton: tTrip("deleteMemberButton"),
                  confirmDeleteTitle: tTrip("confirmDeleteMemberTitle"),
                  confirmDeleteDesc: tTrip("confirmDeleteMemberDesc"),
                  cancelButton: tTrip("cancelButton"),
                  confirmDeleteButton: tTrip("confirmDeleteButton"),
                  deletingButton: tTrip("deletingButton"),
                }}
              />

              {/* My Profile Settings (Change my name, emoji, or PIN) */}
              <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
                <h2 className="text-base font-bold text-[var(--color-fg)] flex items-center gap-2">
                  <span>⚙️</span>
                  <span>{locale === "bn" ? "আমার প্রোফাইল ও সেটিংস" : "My Profile & Settings"}</span>
                </h2>

                <form action={updateMyProfileAction} className="space-y-3">
                  <input type="hidden" name="slug" value={trip.slug} />

                  <div className="space-y-1">
                    <label htmlFor="my-name" className="block text-xs font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "আমার নাম ও ইমোজি" : "My name & emoji"}
                    </label>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <SelectField
                        id="my-emoji"
                        name="emoji"
                        emojiMode
                        defaultValue={currentMember.emoji ?? "🎒"}
                        options={MEMBER_EMOJIS.map((e) => ({
                          value: e,
                          label: e,
                        }))}
                      />
                      <input
                        id="my-name"
                        name="displayName"
                        type="text"
                        required
                        maxLength={40}
                        defaultValue={currentMember.displayName}
                        className="min-h-[40px] sm:min-h-[44px] flex-1 min-w-0 rounded-2xl border border-[var(--color-border)] bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="my-pin" className="block text-xs font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "পিন (ঐচ্ছিক)" : "PIN (optional)"}
                    </label>
                    <input
                      id="my-pin"
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder={currentMember.pinHash ? "••••" : (locale === "bn" ? "৪-৬ ডিজিট" : "4-6 digits")}
                      className="min-h-[44px] w-full rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-1.5 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>

                  <Button type="submit" variant="secondary" className="w-full min-h-[42px] text-xs font-bold">
                    {locale === "bn" ? "সেভ করুন" : "Save changes"}
                  </Button>
                </form>
              </div>
            </div>

            <div className="space-y-5">
              {/* Creator Controls */}
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
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <SelectField
                          name="emoji"
                          defaultValue="👤"
                          emojiMode
                          options={[
                            { value: "👤", label: "👤" },
                            ...MEMBER_EMOJIS.map((emoji) => ({
                              value: emoji,
                              label: emoji,
                            })),
                          ]}
                        />
                        <input
                          id="guestDisplayName"
                          name="displayName"
                          type="text"
                          required
                          maxLength={40}
                          placeholder={tTrip("guestNamePlaceholder")}
                          className="min-h-[40px] sm:min-h-[44px] flex-1 min-w-0 rounded-2xl border border-[var(--color-border)] bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-[40px] sm:min-h-[44px] shrink-0 items-center justify-center rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-2.5 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
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
                            className="flex items-center gap-1.5 sm:gap-2"
                          >
                            <input type="hidden" name="slug" value={trip.slug} />
                            <input type="hidden" name="memberId" value={member.id} />
                            <SelectField
                              name="emoji"
                              defaultValue={member.emoji ?? "🎒"}
                              emojiMode
                              options={[
                                { value: "👤", label: "👤" },
                                ...MEMBER_EMOJIS.map((emoji) => ({
                                  value: emoji,
                                  label: emoji,
                                })),
                              ]}
                            />
                            <input
                              name="displayName"
                              type="text"
                              required
                              maxLength={40}
                              defaultValue={member.displayName}
                              className="min-h-[40px] sm:min-h-[44px] flex-1 min-w-0 rounded-2xl border border-[var(--color-border)] bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="inline-flex min-h-[40px] sm:min-h-[44px] shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs font-bold text-gray-800 hover:bg-gray-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
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

              {/* Activity Log */}
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
                  act_member_claim: tMoney("act_member_claim"),
                  act_member_update: tMoney("act_member_update"),
                  act_member_delete: tMoney("act_member_delete"),
                  act_trip_create: tMoney("act_trip_create"),
                  act_trip_lock: tMoney("act_trip_lock"),
                  act_trip_unlock: tMoney("act_trip_unlock"),
                  act_vote_upsert: tMoney("act_vote_upsert"),
                  act_destination_create: tMoney("act_destination_create"),
                  act_trip_set_destination: tMoney("act_trip_set_destination"),
                  act_itinerary_create: tMoney("act_itinerary_create"),
                  act_itinerary_delete: tMoney("act_itinerary_delete"),
                }}
              />
            </div>
          </div>
        }
      />
    </section>
  );
}
