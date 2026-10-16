"use client";

import { useState } from "react";
import { createTripAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { DatePickerField } from "@/components/DatePickerField";
import type { SupportedLocale } from "@/lib/format";
import { MEMBER_EMOJIS } from "@/lib/trips";

interface NewTripFormProps {
  locale: SupportedLocale;
  labels: {
    tripNameLabel: string;
    tripNamePlaceholder: string;
    destinationLabel: string;
    destinationPlaceholder: string;
    startDateLabel: string;
    endDateLabel: string;
    yourNameLabel: string;
    yourNamePlaceholder: string;
    emojiLabel: string;
    pinLabel: string;
    pinHint: string;
    submitButton: string;
  };
}

export function NewTripForm({ locale, labels }: NewTripFormProps) {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string>(MEMBER_EMOJIS[0]);
  const [pin, setPin] = useState("");

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

  const pinClean = pin.trim();
  const pinError =
    touched.pin && pinClean.length > 0 && !/^[0-9১২৩৪৫৬৭৮৯]{4,6}$/.test(pinClean)
      ? locale === "bn"
        ? "পিন অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।"
        : "PIN must be 4 to 6 numeric digits."
      : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched({ name: true, creatorName: true, pin: true });
    if (name.trim().length < 2 || creatorName.trim().length < 1 || pinError) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form
      action={createTripAction}
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6"
    >
      {/* Step 1: Trip Details */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
            ১
          </span>
          <h2 className="text-sm font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "ভ্রমণের প্রাথমিক তথ্য" : "Trip Information"}
          </h2>
        </div>

        {/* Trip Name (Required) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="trip-name"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.tripNameLabel}
              <span className="ml-1 font-bold text-red-500">*</span>
            </label>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {locale === "bn" ? "আবশ্যক" : "Required"}
            </span>
          </div>

          <div className="relative">
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
              className={`min-h-[46px] w-full rounded-xl border bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none ${
                nameError
                  ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                  : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              }`}
            />
          </div>

          {nameError ? (
            <p className="flex items-center gap-1 text-xs font-medium text-red-600">
              <span>⚠️</span>
              <span>{nameError}</span>
            </p>
          ) : null}
        </div>

        {/* Destination (Optional) */}
        <div className="space-y-1.5">
          <label
            htmlFor="trip-destination"
            className="block text-sm font-semibold text-[var(--color-fg)]"
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
            className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        {/* Dates using custom DatePickerField */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      {/* Step 2: Creator Details */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
            ২
          </span>
          <h2 className="text-sm font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "আপনার পরিচয় (ক্রিয়েটর)" : "Your Profile (Creator)"}
          </h2>
        </div>

        {/* Creator Name (Required) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="creator-name"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.yourNameLabel}
              <span className="ml-1 font-bold text-red-500">*</span>
            </label>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {locale === "bn" ? "আবশ্যক" : "Required"}
            </span>
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
            className={`min-h-[46px] w-full rounded-xl border bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none ${
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

        {/* Emoji Selector */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-[var(--color-fg)]">
            {labels.emojiLabel}
          </legend>

          <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
            {MEMBER_EMOJIS.map((emoji) => {
              const isSelected = selectedEmoji === emoji;
              return (
                <label
                  key={emoji}
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`flex min-h-[48px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border text-2xl transition-all ${
                    isSelected
                      ? "border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-xs scale-105"
                      : "border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="creatorEmoji"
                    value={emoji}
                    checked={isSelected}
                    onChange={() => setSelectedEmoji(emoji)}
                    className="sr-only"
                  />
                  <span>{emoji}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* PIN (Optional) */}
        <div className="space-y-1.5">
          <label
            htmlFor="creator-pin"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {labels.pinLabel}
          </label>

          <input
            id="creator-pin"
            name="creatorPin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, pin: true }))}
            placeholder="১২৩৪ / 1234"
            className={`min-h-[46px] w-full rounded-xl border bg-white px-3.5 py-2 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none ${
              pinError
                ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            }`}
          />

          {pinError ? (
            <p className="flex items-center gap-1 text-xs font-medium text-red-600">
              <span>⚠️</span>
              <span>{pinError}</span>
            </p>
          ) : (
            <p className="text-xs text-[var(--color-fg-muted)]">
              🔒 {labels.pinHint}
            </p>
          )}
        </div>
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="w-full min-h-[50px] rounded-xl text-base font-bold shadow-md hover:shadow-lg transition-all"
      >
        {submitting
          ? locale === "bn"
            ? "তৈরি হচ্ছে..."
            : "Creating trip..."
          : `✨ ${labels.submitButton}`}
      </Button>
    </form>
  );
}
