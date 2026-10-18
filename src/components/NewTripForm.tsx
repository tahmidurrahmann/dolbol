"use client";

import { useMemo, useState } from "react";
import { createTripAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { DatePickerField } from "@/components/DatePickerField";
import { toBanglaDigits, type SupportedLocale } from "@/lib/format";
import { normalizeNameKey } from "@/lib/names";
import { parseFriendsNames } from "@/lib/trips";

interface NewTripFormProps {
  locale: SupportedLocale;
  labels: {
    tripNameLabel: string;
    tripNamePlaceholder: string;
    yourNameLabel: string;
    yourNamePlaceholder: string;
    friendsNamesLabel: string;
    friendsNamesPlaceholder: string;
    friendsNamesHint: string;
    moreDetailsToggle: string;
    destinationLabel: string;
    destinationPlaceholder: string;
    startDateLabel: string;
    endDateLabel: string;
    submitButton: string;
  };
}

export function NewTripForm({ locale, labels }: NewTripFormProps) {
  const [name, setName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [friendsNames, setFriendsNames] = useState("");

  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Field-level validation
  const nameError =
    touched.name && name.trim().length < 2
      ? locale === "bn"
        ? "ট্রিপের নাম কমপক্ষে ২ অক্ষরের হতে হবে।"
        : "Trip name must be at least 2 characters."
      : null;

  const creatorNameError =
    touched.creatorName && creatorName.trim().length < 1
      ? locale === "bn"
        ? "আপনার নাম দেওয়া আবশ্যক।"
        : "Your name is required."
      : null;

  const detectedFriends = useMemo(() => {
    return parseFriendsNames(friendsNames, { creatorName });
  }, [friendsNames, creatorName]);

  const isCreatorInFriends = useMemo(() => {
    if (!creatorName.trim() || !friendsNames.trim()) return false;
    const allParsed = parseFriendsNames(friendsNames);
    const cKey = normalizeNameKey(creatorName);
    return allParsed.some((n) => normalizeNameKey(n) === cKey);
  }, [friendsNames, creatorName]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched({ name: true, creatorName: true });
    if (name.trim().length < 2 || creatorName.trim().length < 1) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form
      action={createTripAction}
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7 mx-auto w-full"
    >
      {/* 1. Trip Name (Always Visible) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="trip-name"
            className="block text-sm font-bold text-[var(--color-fg)]"
          >
            {labels.tripNameLabel}
            <span className="ml-1 font-bold text-red-500">*</span>
          </label>
        </div>

        <input
          id="trip-name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, name: true }))}
          placeholder={labels.tripNamePlaceholder}
          className={`min-h-[48px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-base text-[var(--color-fg)] shadow-2xs transition-all outline-none ${
            nameError
              ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
              : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          }`}
        />

        {nameError ? (
          <p className="flex items-center gap-1 text-xs font-medium text-red-600">
            <span>⚠️</span>
            <span>{nameError}</span>
          </p>
        ) : null}
      </div>

      {/* 2. Your Name (Always Visible) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="creator-name"
            className="block text-sm font-bold text-[var(--color-fg)]"
          >
            {labels.yourNameLabel}
            <span className="ml-1 font-bold text-red-500">*</span>
          </label>
        </div>

        <input
          id="creator-name"
          name="creatorName"
          type="text"
          required
          minLength={1}
          maxLength={40}
          value={creatorName}
          onChange={(e) => setCreatorName(e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, creatorName: true }))}
          placeholder={labels.yourNamePlaceholder}
          className={`min-h-[48px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-base text-[var(--color-fg)] shadow-2xs transition-all outline-none ${
            creatorNameError
              ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
              : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          }`}
        />

        {creatorNameError ? (
          <p className="flex items-center gap-1 text-xs font-medium text-red-600">
            <span>⚠️</span>
            <span>{creatorNameError}</span>
          </p>
        ) : null}
      </div>

      {/* 3. Friends' Names (Always Visible, Optional Multi-line) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="friends-names"
            className="block text-sm font-bold text-[var(--color-fg)]"
          >
            👥 {labels.friendsNamesLabel}
          </label>
          <span className="text-xs text-neutral-400 font-medium">
            {locale === "bn" ? "ঐচ্ছিক" : "Optional"}
          </span>
        </div>

        <textarea
          id="friends-names"
          name="friendsNames"
          rows={3}
          value={friendsNames}
          onChange={(e) => setFriendsNames(e.target.value)}
          placeholder={labels.friendsNamesPlaceholder}
          className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-fg)] shadow-2xs transition-all outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none"
        />

        <p className="text-xs text-neutral-400">💡 {labels.friendsNamesHint}</p>

        {detectedFriends.length > 0 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/60 p-3 sm:p-3.5 space-y-2 dark:border-emerald-500/30 dark:bg-emerald-950/20 transition-all">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <span>✨</span>
                <span>
                  {locale === "bn"
                    ? `${toBanglaDigits(detectedFriends.length)} জন বন্ধু যুক্ত হবেন:`
                    : `${detectedFriends.length} ${detectedFriends.length === 1 ? "friend" : "friends"} recognized:`}
                </span>
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {locale === "bn" ? "গেস্ট মেম্বার" : "Guest members"}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {detectedFriends.map((friendName, idx) => (
                <span
                  key={`${friendName}-${idx}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-fg)] shadow-2xs dark:bg-neutral-900"
                >
                  <span>🎒</span>
                  <span>{friendName}</span>
                </span>
              ))}
            </div>

            {isCreatorInFriends && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 pt-0.5">
                ℹ️{" "}
                {locale === "bn"
                  ? `${creatorName} ইতিমধ্যে ট্রিপের ক্রিয়েটর হিসেবে আছেন, তাই আলাদা গেস্ট লাগবে না।`
                  : `${creatorName} is already the trip creator, so they won't be duplicated.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 4. Collapsible "More details (optional)" for Destination and Dates */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 p-3 sm:p-4 transition-all">
        <button
          type="button"
          onClick={() => setShowMoreDetails((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-sm font-bold text-[var(--color-fg)] hover:text-[var(--color-primary)] transition-colors select-none"
        >
          <span className="flex items-center gap-2">
            <span>📍</span>
            <span>{labels.moreDetailsToggle}</span>
          </span>
          <span className="text-xs text-neutral-400 font-semibold flex items-center gap-1">
            <span>
              {showMoreDetails
                ? locale === "bn"
                  ? "লুকান"
                  : "Hide"
                : locale === "bn"
                  ? "দেখান"
                  : "Show"}
            </span>
            <span
              className={`transition-transform duration-200 ${showMoreDetails ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </span>
        </button>

        {showMoreDetails && (
          <div className="space-y-4 pt-3.5 border-t border-[var(--color-border)]/60 mt-3 animate-in fade-in duration-150">
            {/* Destination */}
            <div className="space-y-1.5">
              <label
                htmlFor="trip-destination"
                className="block text-xs font-bold text-[var(--color-fg)]"
              >
                {labels.destinationLabel}
              </label>
              <input
                id="trip-destination"
                name="destination"
                type="text"
                maxLength={80}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={labels.destinationPlaceholder}
                className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm text-[var(--color-fg)] shadow-2xs outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>

            {/* Travel Dates */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DatePickerField
                id="start-date"
                name="startDate"
                value={startDate}
                onChange={setStartDate}
                label={labels.startDateLabel}
                locale={locale}
                showQuickPills={false}
              />
              <DatePickerField
                id="end-date"
                name="endDate"
                value={endDate}
                onChange={setEndDate}
                label={labels.endDateLabel}
                min={startDate || undefined}
                locale={locale}
                showQuickPills={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="w-full min-h-[50px] text-base font-extrabold transition-all"
      >
        {submitting
          ? locale === "bn"
            ? "তৈরি হচ্ছে..."
            : "Starting trip..."
          : `🚀 ${labels.submitButton}`}
      </Button>
    </form>
  );
}
