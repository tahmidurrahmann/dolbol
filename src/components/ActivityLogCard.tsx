import { formatDate, formatTaka, type SupportedLocale } from "@/lib/format";
import type { MemberInput } from "@/lib/money";
import type { ActivityLogRecordInput } from "@/lib/safety";

export interface ActivityLogCardLabels {
  activityLogTitle: string;
  activityLogSubtitle: string;
  noActivityYet: string;
  act_expense_create: string;
  act_expense_update: string;
  act_expense_delete: string;
  act_settlement_create: string;
  act_settlement_delete: string;
  act_member_join: string;
  act_member_create_guest: string;
  act_member_update: string;
  act_member_claim: string;
  act_member_delete: string;
  act_trip_create: string;
  act_trip_lock: string;
  act_trip_unlock: string;
  act_vote_upsert: string;
  act_destination_create: string;
  act_trip_set_destination: string;
  act_trip_update_dates?: string;
  act_itinerary_create: string;
  act_itinerary_delete: string;
  act_member_claim_device: string;
  act_member_reset_devices: string;
}

interface ActivityLogCardProps {
  locale: SupportedLocale;
  members: MemberInput[];
  activityLogs: ActivityLogRecordInput[];
  labels: ActivityLogCardLabels;
}

export function ActivityLogCard({
  locale,
  members,
  activityLogs,
  labels,
}: ActivityLogCardProps) {
  const memberById = new Map(members.map((m) => [m.id, m]));

  function describeLog(log: ActivityLogRecordInput): string {
    const key = `${log.entityType}_${log.action}`;
    switch (key) {
      case "expense_create": {
        const title = log.after?.title ?? "";
        const amt =
          typeof log.after?.amount === "number"
            ? formatTaka(log.after.amount, locale)
            : "";
        return `${labels.act_expense_create} "${title}" (${amt})`;
      }
      case "expense_update": {
        const beforeTitle = log.before?.title ?? "";
        const afterTitle = log.after?.title ?? beforeTitle;
        const beforeAmt =
          typeof log.before?.amount === "number"
            ? formatTaka(log.before.amount, locale)
            : "";
        const afterAmt =
          typeof log.after?.amount === "number"
            ? formatTaka(log.after.amount, locale)
            : "";
        return `${labels.act_expense_update} "${afterTitle}" (${beforeAmt} → ${afterAmt})`;
      }
      case "expense_delete": {
        const title = log.before?.title ?? log.after?.title ?? "";
        const amtVal = log.before?.amount ?? log.after?.amount;
        const amt =
          typeof amtVal === "number" ? formatTaka(amtVal, locale) : "";
        return `${labels.act_expense_delete} "${title}" (${amt})`;
      }
      case "settlement_create": {
        const from = log.after?.fromMemberId
          ? memberById.get(log.after.fromMemberId)?.displayName
          : "";
        const to = log.after?.toMemberId
          ? memberById.get(log.after.toMemberId)?.displayName
          : "";
        const amt =
          typeof log.after?.amount === "number"
            ? formatTaka(log.after.amount, locale)
            : "";
        return `${labels.act_settlement_create} ${from ?? ""} → ${to ?? ""} (${amt})`;
      }
      case "settlement_delete": {
        const from = log.before?.fromMemberId
          ? memberById.get(log.before.fromMemberId)?.displayName
          : "";
        const to = log.before?.toMemberId
          ? memberById.get(log.before.toMemberId)?.displayName
          : "";
        const amtVal = log.before?.amount ?? log.after?.amount;
        const amt =
          typeof amtVal === "number" ? formatTaka(amtVal, locale) : "";
        return `${labels.act_settlement_delete} ${from ?? ""} → ${to ?? ""} (${amt})`;
      }
      case "member_join":
        return `${labels.act_member_join} ${log.after?.displayName ?? ""}`;
      case "member_create_guest":
        return `${labels.act_member_create_guest} ${log.after?.displayName ?? ""}`;
      case "member_update":
        return `${labels.act_member_update} ${log.before?.displayName ?? ""} → ${log.after?.displayName ?? ""}`;
      case "member_claim":
        return `${labels.act_member_claim} ${log.after?.displayName ?? ""}`;
      case "member_claim_device":
        return `${labels.act_member_claim_device} ${log.after?.displayName ?? ""}`;
      case "member_reset_devices":
        return `${labels.act_member_reset_devices} ${log.after?.displayName ?? ""}`;
      case "member_delete":
        return `${labels.act_member_delete} ${log.before?.displayName ?? ""}`;
      case "trip_create":
        return `${labels.act_trip_create} "${log.after?.name ?? ""}"`;
      case "trip_lock":
        return labels.act_trip_lock;
      case "trip_unlock":
        return labels.act_trip_unlock;
      case "vote_upsert": {
        const dest = log.after?.name ?? "";
        return dest
          ? `${labels.act_vote_upsert} "${dest}"`
          : labels.act_vote_upsert;
      }
      case "destination_create": {
        const dest = log.after?.name ?? "";
        return dest
          ? `${labels.act_destination_create} "${dest}"`
          : labels.act_destination_create;
      }
      case "trip_set_destination": {
        const dest = log.after?.destination ?? "";
        return dest
          ? `${labels.act_trip_set_destination} "${dest}"`
          : labels.act_trip_set_destination;
      }
      case "trip_update_dates": {
        const start = log.after?.startDate
          ? formatDate(new Date(String(log.after.startDate)), locale)
          : "";
        const end = log.after?.endDate
          ? formatDate(new Date(String(log.after.endDate)), locale)
          : "";
        const range = start && end ? `${start} — ${end}` : start || end || "";
        return range
          ? `${labels.act_trip_update_dates ?? "Updated dates:"} ${range}`
          : (labels.act_trip_update_dates ?? "Updated trip dates");
      }
      case "itinerary_create": {
        const title = log.after?.title ?? "";
        return title
          ? `${labels.act_itinerary_create} "${title}"`
          : labels.act_itinerary_create;
      }
      case "itinerary_delete": {
        const title = log.before?.title ?? "";
        return title
          ? `${labels.act_itinerary_delete} "${title}"`
          : labels.act_itinerary_delete;
      }
      default:
        return `${log.entityType} (${log.action})`;
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="space-y-0.5">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>📜</span>
          <span>{labels.activityLogTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-fg-muted)]">
          {labels.activityLogSubtitle}
        </p>
      </div>

      {activityLogs.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-sm text-[var(--color-fg-muted)]">
          {labels.noActivityYet}
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {activityLogs.map((log) => {
            const actor = log.memberId
              ? memberById.get(log.memberId)
              : undefined;
            const isDelete = log.action === "delete";
            const isUpdate = log.action === "update";

            return (
              <li
                key={log.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isDelete
                    ? "border-red-200 bg-red-50/60 text-red-950"
                    : isUpdate
                      ? "border-amber-200 bg-amber-50/60 text-amber-950"
                      : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span>
                    {actor
                      ? `${actor.emoji ?? "🎒"} ${actor.displayName}`
                      : "System"}
                  </span>
                  <span className="font-normal text-[var(--color-fg-muted)]">
                    {formatDate(log.createdAt, locale)}
                  </span>
                </div>
                <p className="mt-0.5">{describeLog(log)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
