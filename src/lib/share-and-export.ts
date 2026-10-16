import { formatDate, formatTaka, type SupportedLocale } from "@/lib/format";
import {
  computeMemberBalances,
  type DayExpenseGroup,
  type ExpenseCategoryValue,
  type ExpenseRecordInput,
  groupExpensesByDhakaDay,
  type MemberBalance,
  type MemberInput,
  type SettlementRecordInput,
  type SimplifiedDebtTransfer,
  simplifyDebts,
} from "@/lib/money";
import {
  type DestinationOptionRecordInput,
  groupItineraryByDay,
  type ItineraryDayGroup,
  type ItineraryItemRecordInput,
  summarizeDestinationVotes,
  type VoteRecordInput,
} from "@/lib/planning";

export interface PublicTripSummary {
  slug: string;
  name: string;
  destination: string | null;
  topVotedDestination: string | null;
  dateRangeLabel: string | null;
  memberCount: number;
  members: Array<{
    displayName: string;
    emoji: string;
    isGuest: boolean;
  }>;
  itineraryDays: ItineraryDayGroup[];
}

/**
 * Builds a strictly sanitized public summary of a trip for `/trips/[slug]/summary`
 * and `/api/trips/[slug]/share-image`.
 * Contains ZERO money details (no expenses, no amounts, no balances, no settlements).
 */
export function buildPublicTripSummary(args: {
  slug: string;
  name: string;
  destination: string | null;
  startDate: Date | null;
  endDate: Date | null;
  members: ReadonlyArray<MemberInput>;
  options: ReadonlyArray<DestinationOptionRecordInput>;
  votes: ReadonlyArray<VoteRecordInput>;
  itinerary: ReadonlyArray<ItineraryItemRecordInput>;
  locale: SupportedLocale;
}): PublicTripSummary {
  let dateRangeLabel: string | null = null;
  if (args.startDate && args.endDate) {
    dateRangeLabel = `${formatDate(args.startDate, args.locale)} — ${formatDate(args.endDate, args.locale)}`;
  } else if (args.startDate) {
    dateRangeLabel = formatDate(args.startDate, args.locale);
  } else if (args.endDate) {
    dateRangeLabel = formatDate(args.endDate, args.locale);
  }

  const voteSummary = summarizeDestinationVotes({
    options: args.options,
    votes: args.votes,
    members: args.members,
    currentMemberId: args.members[0]?.id ?? "",
  });

  const leadingOption = voteSummary.options.find((o) => o.isLeading);

  const itineraryDays = groupItineraryByDay({
    items: args.itinerary,
    tripStartDate: args.startDate,
    locale: args.locale,
  });

  return {
    slug: args.slug,
    name: args.name,
    destination: args.destination,
    topVotedDestination: leadingOption ? leadingOption.name : null,
    dateRangeLabel,
    memberCount: args.members.length,
    members: args.members.map((m) => ({
      displayName: m.displayName,
      emoji: m.emoji ?? (m.isGuest ? "👤" : "🎒"),
      isGuest: Boolean(m.isGuest),
    })),
    itineraryDays,
  };
}

export interface DailyCostSheetData {
  tripName: string;
  destination: string | null;
  totalTripSpend: number;
  members: MemberInput[];
  dayGroups: DayExpenseGroup[];
  balances: MemberBalance[];
  simplifiedDebts: SimplifiedDebtTransfer[];
}

export function buildDailyCostSheetData(args: {
  tripName: string;
  destination: string | null;
  tripStartDate: Date | null;
  tripEndDate: Date | null;
  members: MemberInput[];
  expenses: ExpenseRecordInput[];
  settlements: SettlementRecordInput[];
  locale: SupportedLocale;
  otherDatesLabel?: string;
}): DailyCostSheetData {
  const activeExpenses = args.expenses.filter((e) => !e.deletedAt);
  const totalTripSpend = activeExpenses.reduce((sum, e) => sum + e.amount, 0);

  const dayGroups = groupExpensesByDhakaDay({
    expenses: activeExpenses,
    members: args.members,
    tripStartDate: args.tripStartDate,
    tripEndDate: args.tripEndDate,
    locale: args.locale,
    otherDatesLabel: args.otherDatesLabel,
  });

  const balances = computeMemberBalances({
    members: args.members,
    expenses: activeExpenses,
    settlements: args.settlements,
  });

  const simplifiedDebts = simplifyDebts(balances);

  return {
    tripName: args.tripName,
    destination: args.destination,
    totalTripSpend,
    members: args.members,
    dayGroups,
    balances,
    simplifiedDebts,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: ReadonlyArray<string | number>): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Generates a downloadable UTF-8 CSV (with BOM so Excel on Windows/Mac/Android
 * renders Bangla characters properly) containing:
 * 1. Trip Overview & Total Spend
 * 2. Per-Day Totals & Per-Person Daily Cost Matrix
 * 3. Per-Person Overall Totals (Paid, Share, Settlements, Net Balance)
 * 4. Simplified Who Owes Whom Transfers
 * 5. Itemized Daily Expense List
 */
export function generateDailyCostSheetCsv(
  sheet: DailyCostSheetData,
  locale: SupportedLocale,
): string {
  const memberById = new Map(sheet.members.map((m) => [m.id, m]));
  const lines: string[] = [];

  // 1. Header & Trip Overview
  lines.push(
    csvRow([
      locale === "bn" ? "ট্রিপের নাম" : "Trip Name",
      sheet.tripName,
    ]),
  );
  if (sheet.destination) {
    lines.push(
      csvRow([
        locale === "bn" ? "গন্তব্য" : "Destination",
        sheet.destination,
      ]),
    );
  }
  lines.push(
    csvRow([
      locale === "bn" ? "মোট খরচ (৳)" : "Total Trip Spend (BDT)",
      sheet.totalTripSpend,
    ]),
  );
  lines.push("");

  // 2. Per-Day Totals & Per-Person Daily Cost Matrix
  lines.push(
    csvRow([
      locale === "bn"
        ? "=== প্রতিদিনের খরচ ও জনপ্রতি হিসাব ==="
        : "=== Per-Day Totals & Per-Person Daily Cost ===",
    ]),
  );
  lines.push(
    csvRow([
      locale === "bn" ? "দিন / তারিখ" : "Day / Date",
      locale === "bn" ? "দিনের মোট (৳)" : "Day Total (BDT)",
      ...sheet.members.map((m) => `${m.displayName} (৳)`),
    ]),
  );

  for (const group of sheet.dayGroups) {
    lines.push(
      csvRow([
        group.label,
        group.dayTotal,
        ...sheet.members.map((m) => group.perPersonCost[m.id] ?? 0),
      ]),
    );
  }
  lines.push("");

  // 3. Per-Person Overall Totals
  lines.push(
    csvRow([
      locale === "bn"
        ? "=== সদস্যদের সামগ্রিক ব্যালেন্স ==="
        : "=== Per-Person Overall Totals ===",
    ]),
  );
  lines.push(
    csvRow(
      locale === "bn"
        ? [
            "সদস্য",
            "মোট দিয়েছে (৳)",
            "নিজের ভাগের খরচ (৳)",
            "পরিশোধ করেছে (৳)",
            "পরিশোধ পেয়েছে (৳)",
            "নিট ব্যালেন্স (৳)",
          ]
        : [
            "Member",
            "Total Paid (BDT)",
            "Total Share (BDT)",
            "Settlements Sent (BDT)",
            "Settlements Received (BDT)",
            "Net Balance (BDT)",
          ],
    ),
  );

  for (const bal of sheet.balances) {
    lines.push(
      csvRow([
        bal.displayName,
        bal.totalPaid,
        bal.totalOwed,
        bal.settlementsSent,
        bal.settlementsReceived,
        bal.netBalance,
      ]),
    );
  }
  lines.push("");

  // 4. Who Owes Whom (Simplified)
  lines.push(
    csvRow([
      locale === "bn"
        ? "=== কে কাকে কত টাকা দেবে (চূড়ান্ত নিষ্পত্তি) ==="
        : "=== Who Owes Whom (Simplified Debts) ===",
    ]),
  );
  lines.push(
    csvRow(
      locale === "bn"
        ? ["যিনি দেবেন", "যিনি পাবেন", "পরিমাণ (৳)"]
        : ["From (Debtor)", "To (Creditor)", "Amount (BDT)"],
    ),
  );

  if (sheet.simplifiedDebts.length === 0) {
    lines.push(
      csvRow([
        locale === "bn"
          ? "সব হিসাব সমান!"
          : "All settled up!",
        "-",
        0,
      ]),
    );
  } else {
    for (const debt of sheet.simplifiedDebts) {
      const fromName =
        memberById.get(debt.fromMemberId)?.displayName ?? debt.fromMemberId;
      const toName =
        memberById.get(debt.toMemberId)?.displayName ?? debt.toMemberId;
      lines.push(csvRow([fromName, toName, debt.amount]));
    }
  }
  lines.push("");

  // 5. Itemized Expenses by Day
  lines.push(
    csvRow([
      locale === "bn"
        ? "=== খরচের বিস্তারিত তালিকা ==="
        : "=== Itemized Expenses ===",
    ]),
  );
  lines.push(
    csvRow(
      locale === "bn"
        ? ["দিন", "বিবরণ", "ধরন", "বিল দিয়েছেন", "পরিমাণ (৳)"]
        : ["Day", "Title", "Category", "Paid By", "Amount (BDT)"],
    ),
  );

  for (const group of sheet.dayGroups) {
    for (const exp of group.expenses) {
      const payerName =
        memberById.get(exp.paidById)?.displayName ?? exp.paidById;
      lines.push(
        csvRow([
          group.label,
          exp.title,
          exp.category,
          payerName,
          exp.amount,
        ]),
      );
    }
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates a standalone printable HTML document for the Daily Cost Sheet
 * so users can print or Save as PDF directly from mobile or desktop browsers.
 */
export function generateDailyCostSheetHtml(args: {
  sheet: DailyCostSheetData;
  slug: string;
  locale: SupportedLocale;
  categoryLabels: Record<ExpenseCategoryValue, string>;
}): string {
  const { sheet, slug, locale, categoryLabels } = args;
  const memberById = new Map(sheet.members.map((m) => [m.id, m]));
  const isBn = locale === "bn";

  const dayRowsHtml = sheet.dayGroups
    .map((group) => {
      const memberCells = sheet.members
        .map(
          (m) =>
            `<td class="num">${formatTaka(group.perPersonCost[m.id] ?? 0, locale)}</td>`,
        )
        .join("");
      return `<tr>
        <td><strong>${escapeHtml(group.label)}</strong></td>
        <td class="num total">${formatTaka(group.dayTotal, locale)}</td>
        ${memberCells}
      </tr>`;
    })
    .join("\n");

  const balanceRowsHtml = sheet.balances
    .map((b) => {
      const netFormatted =
        b.netBalance > 0
          ? `+${formatTaka(b.netBalance, locale)}`
          : formatTaka(b.netBalance, locale);
      const netClass =
        b.netBalance > 0 ? "pos" : b.netBalance < 0 ? "neg" : "";
      return `<tr>
        <td>${escapeHtml(b.emoji)} ${escapeHtml(b.displayName)}</td>
        <td class="num">${formatTaka(b.totalPaid, locale)}</td>
        <td class="num">${formatTaka(b.totalOwed, locale)}</td>
        <td class="num">${formatTaka(b.settlementsSent, locale)}</td>
        <td class="num">${formatTaka(b.settlementsReceived, locale)}</td>
        <td class="num ${netClass}"><strong>${netFormatted}</strong></td>
      </tr>`;
    })
    .join("\n");

  const debtRowsHtml =
    sheet.simplifiedDebts.length === 0
      ? `<p class="settled">${isBn ? "সব হিসাব সমান! কেউ কারো কাছে টাকা পায় না।" : "Everyone is settled up! No pending debts."}</p>`
      : `<ul>
          ${sheet.simplifiedDebts
            .map((d) => {
              const from = memberById.get(d.fromMemberId);
              const to = memberById.get(d.toMemberId);
              return `<li>
                <strong>${escapeHtml(from?.displayName ?? d.fromMemberId)}</strong>
                → ${isBn ? "দেবে" : "owes"} →
                <strong>${escapeHtml(to?.displayName ?? d.toMemberId)}</strong>:
                <span class="total">${formatTaka(d.amount, locale)}</span>
              </li>`;
            })
            .join("\n")}
        </ul>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(sheet.tripName)} — ${isBn ? "খরচের শিট" : "Daily Cost Sheet"}</title>
  <style>
    body {
      font-family: "Noto Sans Bengali", "Inter", system-ui, sans-serif;
      color: #111c16;
      background: #f8faf9;
      margin: 0;
      padding: 24px 16px;
      line-height: 1.5;
    }
    .sheet {
      max-width: 780px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d5e0da;
      border-radius: 12px;
      padding: 24px;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid #0f6b4a;
      background: #0f6b4a;
      color: #ffffff;
    }
    .btn-secondary {
      background: #ffffff;
      color: #0f6b4a;
    }
    h1 { margin: 0 0 4px; color: #0f6b4a; font-size: 24px; }
    h2 { margin: 24px 0 10px; font-size: 17px; border-bottom: 2px solid #eef3f0; padding-bottom: 6px; }
    .meta { color: #4a5d52; font-size: 14px; margin-bottom: 16px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
    th, td { border: 1px solid #d5e0da; padding: 8px 10px; text-align: left; }
    th { background: #eef3f0; font-weight: 700; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .total { color: #0f6b4a; font-weight: 700; }
    .pos { color: #0f6b4a; }
    .neg { color: #b91c1c; }
    ul { padding-left: 20px; margin: 8px 0; }
    li { margin-bottom: 6px; font-size: 15px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { border: none; padding: 0; max-width: 100%; }
      .actions { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="actions">
      <button class="btn" onclick="window.print()">🖨️ ${isBn ? "প্রিন্ট / PDF সেভ করুন" : "Print / Save as PDF"}</button>
      <a class="btn btn-secondary" href="/api/trips/${encodeURIComponent(slug)}/cost-sheet?format=csv">📥 ${isBn ? "CSV (Excel) ডাউনলোড করুন" : "Download CSV (Excel)"}</a>
      <a class="btn btn-secondary" href="/trips/${encodeURIComponent(slug)}">← ${isBn ? "ট্রিপে ফিরে যান" : "Back to Trip"}</a>
    </div>

    <h1>${escapeHtml(sheet.tripName)}</h1>
    <div class="meta">
      ${sheet.destination ? `${isBn ? "গন্তব্য:" : "Destination:"} <strong>${escapeHtml(sheet.destination)}</strong> • ` : ""}
      ${isBn ? "মোট খরচ:" : "Total Trip Spend:"} <strong class="total">${formatTaka(sheet.totalTripSpend, locale)}</strong>
    </div>

    <h2>1. ${isBn ? "কে কাকে কত টাকা দেবে (সহজ হিসাব)" : "Who Owes Whom (Simplified Debts)"}</h2>
    ${debtRowsHtml}

    <h2>2. ${isBn ? "প্রতিদিনের খরচ ও জনপ্রতি হিসাব" : "Per-Day Totals & Per-Person Daily Cost"}</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${isBn ? "দিন / তারিখ" : "Day / Date"}</th>
            <th class="num">${isBn ? "দিনের মোট" : "Day Total"}</th>
            ${sheet.members.map((m) => `<th class="num">${escapeHtml(m.displayName)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${dayRowsHtml}
        </tbody>
      </table>
    </div>

    <h2>3. ${isBn ? "সদস্যদের সামগ্রিক ব্যালেন্স (Per-Person Totals)" : "Per-Person Overall Totals"}</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${isBn ? "সদস্য" : "Member"}</th>
            <th class="num">${isBn ? "দিয়েছে" : "Paid"}</th>
            <th class="num">${isBn ? "নিজের খরচ" : "Share"}</th>
            <th class="num">${isBn ? "পরিশোধ করেছে" : "Sent"}</th>
            <th class="num">${isBn ? "পরিশোধ পেয়েছে" : "Received"}</th>
            <th class="num">${isBn ? "নিট ব্যালেন্স" : "Net Balance"}</th>
          </tr>
        </thead>
        <tbody>
          ${balanceRowsHtml}
        </tbody>
      </table>
    </div>

    <h2>4. ${isBn ? "খরচের বিস্তারিত তালিকা" : "Itemized Daily Expenses"}</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${isBn ? "দিন" : "Day"}</th>
            <th>${isBn ? "বিবরণ" : "Expense"}</th>
            <th>${isBn ? "ধরন" : "Category"}</th>
            <th>${isBn ? "বিল দিয়েছেন" : "Paid By"}</th>
            <th class="num">${isBn ? "পরিমাণ" : "Amount"}</th>
          </tr>
        </thead>
        <tbody>
          ${sheet.dayGroups
            .flatMap((g) =>
              g.expenses.map((exp) => {
                const payer = memberById.get(exp.paidById);
                return `<tr>
                  <td>${escapeHtml(g.label)}</td>
                  <td>${escapeHtml(exp.title)}</td>
                  <td>${escapeHtml(categoryLabels[exp.category] ?? exp.category)}</td>
                  <td>${escapeHtml(payer?.displayName ?? exp.paidById)}</td>
                  <td class="num">${formatTaka(exp.amount, locale)}</td>
                </tr>`;
              }),
            )
            .join("\n")}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}
