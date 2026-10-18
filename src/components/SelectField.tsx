"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

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
  emojiMode?: boolean;
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
  placeholder = "All options",
  options,
  className = "",
  helperText,
  icon,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
  emojiMode,
}: SelectFieldProps) {
  const generatedId = useId();
  const inputId = explicitId ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLUListElement>(null);

  // Controlled or uncontrolled
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

  const [openUpward, setOpenUpward] = useState(false);

  const computeDirection = useCallback(() => {
    if (triggerRef.current && typeof window !== "undefined") {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUpward(spaceBelow < 260 && spaceAbove > spaceBelow);
    }
  }, []);

  function openDropdown() {
    if (disabled) return;
    computeDirection();
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
    if (!open) return;
    function handlePositionUpdate() {
      computeDirection();
    }
    window.addEventListener("resize", handlePositionUpdate);
    window.addEventListener("scroll", handlePositionUpdate, { passive: true });
    return () => {
      window.removeEventListener("resize", handlePositionUpdate);
      window.removeEventListener("scroll", handlePositionUpdate);
    };
  }, [open, computeDirection]);

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
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
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

  const isEmojiMode =
    Boolean(emojiMode) ||
    (options.length > 0 &&
      options.every(
        (o) => o.label.length <= 4 && !/[a-zA-Z0-9]/.test(o.label),
      ));

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-1.5 ${
        isEmojiMode ? "w-auto shrink-0" : ""
      } ${className}`}
    >
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

        {isEmojiMode ? (
          /* Compact Emoji Trigger Button (takes exact width of emoji) */
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
            className={`flex min-h-[40px] sm:min-h-[44px] w-10 sm:w-[48px] min-w-10 sm:min-w-[48px] max-w-10 sm:max-w-[48px] items-center justify-center rounded-2xl border bg-white p-1 text-center transition-all outline-none cursor-pointer ${
              disabled
                ? "cursor-not-allowed bg-gray-100 opacity-60 border-gray-200"
                : error
                  ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                  : open
                    ? "border-emerald-500 ring-2 ring-emerald-100 shadow-2xs scale-102"
                    : "border-gray-200/90 hover:border-emerald-300 shadow-2xs hover:bg-emerald-50/20"
            }`}
          >
            <span className="text-xl sm:text-2xl leading-none select-none">
              {selectedOption?.label ?? current ?? "👤"}
            </span>
          </button>
        ) : (
          /* Custom Trigger Button (Matches clean screenshot 2 style) */
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
            className={`flex min-h-[42px] w-full items-center justify-between gap-2.5 rounded-xl border bg-white px-3.5 py-2 text-left text-sm transition-all outline-none cursor-pointer ${
              disabled
                ? "cursor-not-allowed bg-gray-100 opacity-60 border-gray-200"
                : error
                  ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                  : open
                    ? "border-gray-400 ring-2 ring-gray-200 shadow-2xs"
                    : "border-gray-200/90 hover:border-gray-300 shadow-2xs"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {icon ? (
                <span className="shrink-0 text-gray-500">{icon}</span>
              ) : null}

              {selectedOption ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {selectedOption.icon ? (
                    <span className="shrink-0 text-base leading-none">
                      {selectedOption.icon}
                    </span>
                  ) : null}
                  <span className="truncate font-medium text-gray-800">
                    {selectedOption.label}
                  </span>
                  {selectedOption.badge ? (
                    <span className="shrink-0 text-xs text-gray-400">
                      ({selectedOption.badge})
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="truncate text-gray-500 font-normal">
                  {placeholder}
                </span>
              )}
            </div>

            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`size-4 shrink-0 text-gray-400 transition-transform duration-150 ${
                open ? "rotate-180" : ""
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
        )}

        {open ? (
          <>
            {/* Transparent backdrop for outside-click dismiss */}
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={close}
              aria-hidden="true"
            />

            {isEmojiMode ? (
              /* Emoji Grid Dropdown Popover */
              <div
                role="dialog"
                aria-label={label ?? "Emoji picker"}
                className={`absolute left-0 ${
                  openUpward
                    ? "bottom-full mb-1.5 origin-bottom slide-in-from-bottom-2"
                    : "top-full mt-1.5 origin-top slide-in-from-top-2"
                } z-50 w-max min-w-[190px] max-w-[230px] rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100`}
              >
                <div className="grid grid-cols-4 gap-1.5 p-1">
                  {options.map((opt) => {
                    const isSelected = opt.value === current;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelect(opt.value)}
                        className={`flex size-10 items-center justify-center rounded-xl text-xl select-none transition-transform hover:scale-115 active:scale-95 cursor-pointer ${
                          isSelected
                            ? "bg-[#e8f5ee] border-2 border-emerald-400 shadow-2xs scale-105"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Dropdown Menu (Exact match to Screenshot 2) */
            <div
              role="dialog"
              aria-label={label ?? placeholder}
              className={`absolute left-0 ${
                openUpward
                  ? "bottom-full mb-1.5 origin-bottom slide-in-from-bottom-2"
                  : "top-full mt-1.5 origin-top slide-in-from-top-2"
              } w-full min-w-[200px] z-50 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100`}
            >
              {/* Optional Search Input */}
              {searchable && options.length > 5 ? (
                <div className="px-2 pb-1.5 border-b border-gray-100 mb-1">
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
                    className="min-h-[34px] w-full rounded-lg border border-gray-200 bg-gray-50/50 px-2.5 py-1 text-xs text-gray-800 outline-none focus:border-blue-500 focus:bg-white"
                  />
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
                className="max-h-60 overflow-y-auto space-y-0.5 no-scrollbar"
              >
                {filteredOptions.length === 0 ? (
                  <li className="py-4 text-center text-xs font-medium text-gray-400">
                    No results found
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
                        className={`flex min-h-[36px] cursor-pointer select-none items-center justify-between gap-2.5 px-4 py-2 text-sm transition-colors ${
                          opt.disabled
                            ? "cursor-not-allowed opacity-40 text-gray-400"
                            : isSelected
                              ? "bg-[#1a73e8] text-white font-medium"
                              : isHighlighted
                                ? "bg-gray-100 text-gray-900"
                                : "text-gray-800 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {opt.icon ? (
                            <span className="shrink-0 text-base leading-none">
                              {opt.icon}
                            </span>
                          ) : null}
                          <span className="truncate">{opt.label}</span>
                        </div>

                        {opt.badge ? (
                          <span
                            className={`shrink-0 text-xs ${
                              isSelected ? "text-blue-100" : "text-gray-400"
                            }`}
                          >
                            ({opt.badge})
                          </span>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}
        </>
      ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1 text-xs font-medium text-red-600"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-[var(--color-fg-muted)]">{helperText}</p>
      ) : null}
    </div>
  );
}
