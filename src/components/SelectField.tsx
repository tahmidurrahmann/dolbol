"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  id?: string;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (val: string) => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  placeholder?: string;
  options: SelectOption[];
  className?: string;
  helperText?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function SelectField({
  id: explicitId,
  name,
  value,
  defaultValue,
  onChange,
  label,
  required = false,
  error = null,
  placeholder = "নির্বাচন করুন",
  options,
  className = "",
  helperText,
  icon,
  disabled = false,
  searchable = false,
  searchPlaceholder = "খুঁজুন...",
}: SelectFieldProps) {
  const generatedId = useId();
  const inputId = explicitId ?? generatedId;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const listboxId = `${inputId}-listbox`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLUListElement>(null);

  // Works controlled (onChange provided) or uncontrolled (defaultValue or initial option)
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(
    defaultValue ?? (options[0]?.value || ""),
  );
  const current = isControlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === current),
    [options, current],
  );

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q)),
    );
  }, [options, searchQuery]);

  function commit(val: string) {
    if (!isControlled) {
      setInternal(val);
    }
    onChange?.(val);
  }

  function handleSelect(val: string) {
    const opt = options.find((o) => o.value === val);
    if (!opt || opt.disabled) return;
    commit(val);
    close();
  }

  function openDropdown() {
    if (disabled) return;
    setSearchQuery("");
    const curIdx = filteredOptions.findIndex((o) => o.value === current);
    setHighlightedIndex(curIdx >= 0 ? curIdx : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setSearchQuery("");
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open, searchable]);

  // Keyboard navigation on trigger button
  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDropdown();
    }
  }

  // Keyboard navigation within list
  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1,
      );
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const target = filteredOptions[highlightedIndex];
      if (target && !target.disabled) {
        handleSelect(target.value);
      }
    } else if (e.key === "Tab") {
      close();
    }
  }

  const describedBy = error ? errorId : helperText ? helpId : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <label
          htmlFor={inputId}
          className="text-sm font-semibold text-[var(--color-fg)] flex items-center justify-between"
        >
          <span>
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-1 font-bold text-red-500">
                *
              </span>
            ) : null}
          </span>
        </label>
      ) : null}

      <div className="relative">
        {/* Hidden native input for 100% HTML Form and Server Action compatibility */}
        <input
          type="hidden"
          name={name}
          value={current ?? ""}
          required={required}
        />

        {/* Custom Trigger Button */}
        <button
          ref={triggerRef}
          id={inputId}
          type="button"
          disabled={disabled}
          onClick={() => (open ? close() : openDropdown())}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-describedby={describedBy}
          className={`group flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left text-base transition-all outline-none ${
            disabled
              ? "cursor-not-allowed bg-[var(--color-surface-muted)] opacity-60 border-[var(--color-border)]"
              : error
                ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                : open
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-xs"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/50 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 shadow-xs"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {icon ? (
              <span className="shrink-0 text-[var(--color-fg-muted)] group-hover:text-[var(--color-primary)] transition-colors">
                {icon}
              </span>
            ) : null}

            {selectedOption ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {selectedOption.icon ? (
                  <span className="shrink-0 text-lg leading-none">
                    {selectedOption.icon}
                  </span>
                ) : null}
                <span className="truncate font-semibold text-[var(--color-fg)]">
                  {selectedOption.label}
                </span>
                {selectedOption.badge ? (
                  <span className="shrink-0 rounded-md bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-2xs font-bold text-[var(--color-fg-muted)]">
                    {selectedOption.badge}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="truncate text-[var(--color-fg-muted)] font-normal">
                {placeholder}
              </span>
            )}
          </div>

          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-[var(--color-fg-muted)] transition-transform duration-200 ${
              open ? "rotate-180 text-[var(--color-primary)]" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </button>

        {open ? (
          <>
            {/* Backdrop: Darkened bottom sheet on mobile, click-away transparent on desktop */}
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs sm:bg-transparent sm:backdrop-blur-none"
              onClick={close}
              aria-hidden="true"
            />

            {/* Dropdown Container: Bottom sheet on mobile (<640px), floating popover on desktop (>=640px) */}
            <div
              role="dialog"
              aria-label={label ?? placeholder}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1.5 sm:w-full sm:min-w-[240px] sm:rounded-2xl sm:border sm:p-2 sm:pb-2 sm:shadow-xl sm:animate-in sm:fade-in sm:zoom-in-95"
            >
              {/* Mobile Sheet Handle and Header */}
              <div className="mb-2 flex items-center justify-between px-1 pb-2 border-b border-[var(--color-border)] sm:hidden">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-10 rounded-full bg-[var(--color-border)] mx-auto absolute left-1/2 -top-3 -translate-x-1/2 sm:hidden" />
                  <p className="text-sm font-bold text-[var(--color-fg)]">
                    {label ?? placeholder}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-muted)] transition-colors"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Optional Search Input */}
              {searchable && options.length > 5 ? (
                <div className="mb-2 px-1">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]">
                      🔍
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setHighlightedIndex(0);
                      }}
                      onKeyDown={handleListKeyDown}
                      placeholder={searchPlaceholder}
                      className="min-h-[38px] w-full rounded-xl border border-[var(--color-border)] bg-white pl-8 pr-3 py-1.5 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                    />
                  </div>
                </div>
              ) : null}

              {/* Options List */}
              <ul
                ref={optionsListRef}
                id={listboxId}
                role="listbox"
                aria-label={label ?? placeholder}
                tabIndex={-1}
                onKeyDown={handleListKeyDown}
                className="max-h-[50vh] sm:max-h-60 overflow-y-auto space-y-1 p-0.5 no-scrollbar"
              >
                {filteredOptions.length === 0 ? (
                  <li className="py-6 text-center text-xs font-medium text-[var(--color-fg-muted)]">
                    কোনো ফলাফল পাওয়া যায়নি
                  </li>
                ) : (
                  filteredOptions.map((opt, idx) => {
                    const isSelected = opt.value === current;
                    const isHighlighted = idx === highlightedIndex;

                    return (
                      <li
                        key={opt.value}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={opt.disabled}
                        onClick={() => handleSelect(opt.value)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`flex min-h-[44px] cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-all ${
                          opt.disabled
                            ? "cursor-not-allowed opacity-40"
                            : isSelected
                              ? "bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] font-bold shadow-2xs"
                              : isHighlighted
                                ? "bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
                                : "text-[var(--color-fg)] hover:bg-[var(--color-surface-muted)]"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {opt.icon ? (
                            <span className="shrink-0 text-xl leading-none">
                              {opt.icon}
                            </span>
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{opt.label}</span>
                              {opt.badge ? (
                                <span className="shrink-0 rounded-md bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-2xs font-semibold text-[var(--color-fg-muted)]">
                                  {opt.badge}
                                </span>
                              ) : null}
                            </div>
                            {opt.description ? (
                              <p className="truncate text-xs font-normal text-[var(--color-fg-muted)]">
                                {opt.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {isSelected ? (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="size-4 shrink-0 text-[var(--color-primary)]"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </>
        ) : null}
      </div>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1 text-xs font-medium text-red-600"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={helpId} className="text-xs text-[var(--color-fg-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
