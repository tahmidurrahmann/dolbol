"use client";

import { useState } from "react";
import { createTripAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { DatePickerField } from "@/components/DatePickerField";
import type { SupportedLocale } from "@/lib/format";

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
