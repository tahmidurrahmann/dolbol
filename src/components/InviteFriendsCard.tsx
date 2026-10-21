"use client";

import { useState, useSyncExternalStore } from "react";
import type { SupportedLocale } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";

interface InviteFriendsCardProps {
  slug: string;
  tripName: string;
  destination?: string | null;
  locale: SupportedLocale;
  compact?: boolean;
}

const emptySubscribe = () => () => {};

// Shared button base: 38px/42px tap target, labels truncate cleanly on 320px screens.
const actionBase =
  "min-w-0 flex min-h-[38px] min-[360px]:min-h-[42px] items-center justify-center gap-1 min-[360px]:gap-1.5 rounded-full px-1.5 min-[360px]:px-2.5 sm:px-3 py-1.5 text-[11px] min-[360px]:text-xs font-black shadow-2xs active:scale-[0.98] transition-all cursor-pointer";

interface ShareActionsProps {
  bn: boolean;
  hasWebShare: boolean;
  copied: boolean;
  isMobile: boolean;
  whatsappUrl: string;
  messengerUrl: string;
  onNativeShare: () => void;
  onCopy: () => void;
  onMessengerClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function ShareActions({
  bn,
  hasWebShare,
  copied,
  isMobile,
  whatsappUrl,
  messengerUrl,
  onNativeShare,
  onCopy,
  onMessengerClick,
}: ShareActionsProps) {
  return (
    // Single row of 3 buttons, fully responsive on >=320px viewports
    <div className="grid grid-cols-3 gap-1 min-[360px]:gap-2 pt-1 w-full">
      {hasWebShare ? (
        <button
          type="button"
          onClick={onNativeShare}
          className={`${actionBase} bg-[#18201a] text-white hover:bg-[#253229]`}
        >
          <span aria-hidden="true" className="shrink-0 text-xs min-[360px]:text-sm">
            📤
          </span>
          <span className="truncate">{bn ? "শেয়ার" : "Share"}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onCopy}
          className={`${actionBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
        >
          <span aria-hidden="true" className="shrink-0 text-xs min-[360px]:text-sm">
            📋
          </span>
          <span className="truncate">
            {copied
              ? bn
                ? "কপি হয়েছে!"
                : "Copied!"
              : bn
                ? "লিংক কপি"
                : "Copy link"}
          </span>
        </button>
      )}

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${actionBase} group border border-emerald-300/80 bg-gradient-to-r from-emerald-50 via-[#f0fbf4] to-teal-50 text-[#0f6b4a] hover:border-emerald-400 hover:from-emerald-100/90 hover:to-teal-100/90`}
      >
        <span
          aria-hidden="true"
          className="flex size-3.5 min-[360px]:size-5 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] min-[360px]:text-xs shrink-0 transition-transform group-hover:scale-110"
        >
          💬
        </span>
        <span className="truncate tracking-tight">WhatsApp</span>
      </a>

      <a
        href={messengerUrl}
        // On phones this is an app deep link (fb-messenger://); a new tab is not wanted there.
        target={isMobile ? undefined : "_blank"}
        rel={isMobile ? undefined : "noopener noreferrer"}
        onClick={onMessengerClick}
        className={`${actionBase} group border border-blue-300/80 bg-gradient-to-r from-blue-50 via-[#f0f6ff] to-indigo-50 text-[#0b57d0] hover:border-blue-400 hover:from-blue-100/90 hover:to-indigo-100/90`}
      >
        <span
          aria-hidden="true"
          className="flex size-3.5 min-[360px]:size-5 items-center justify-center rounded-full bg-blue-500/15 text-[10px] min-[360px]:text-xs shrink-0 transition-transform group-hover:scale-110"
        >
          ⚡
        </span>
        <span className="truncate tracking-tight">Messenger</span>
      </a>
    </div>
  );
}

export function InviteFriendsCard({
  slug,
  tripName,
  destination,
  locale,
  compact = false,
}: InviteFriendsCardProps) {
  const [copied, setCopied] = useState(false);

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const fullUrl = isClient
    ? `${window.location.origin}/trips/${slug}`
    : getSiteUrl(`/trips/${slug}`).toString();

  const hasWebShare =
    isClient &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  const bn = locale === "bn";

  const shareText = bn
    ? `🌴 ${tripName}${destination ? ` (${destination})` : ""} ট্রিপের হিসাব রাখতে যুক্ত হন:\n${fullUrl}`
    : `🌴 Join the group trip: ${tripName}${destination ? ` (${destination})` : ""}:\n${fullUrl}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: tripName,
          text: shareText,
          url: fullUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await handleCopy();
    }
  }

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    shareText,
  )}`;

  const isMobile =
    isClient &&
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const messengerUrl = isMobile
    ? `fb-messenger://share?link=${encodeURIComponent(fullUrl)}`
    : `https://www.facebook.com/dialog/send?link=${encodeURIComponent(
        fullUrl,
      )}&app_id=291494419107518&redirect_uri=${encodeURIComponent(fullUrl)}`;

  function handleMessengerClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isMobile && typeof window !== "undefined") {
      e.preventDefault();
      window.open(
        messengerUrl,
        "fb-messenger",
        "width=600,height=520,toolbar=no,menubar=no,location=no",
      );
    }
  }

  const actions = (
    <ShareActions
      bn={bn}
      hasWebShare={hasWebShare}
      copied={copied}
      isMobile={isMobile}
      whatsappUrl={whatsappUrl}
      messengerUrl={messengerUrl}
      onNativeShare={handleNativeShare}
      onCopy={handleCopy}
      onMessengerClick={handleMessengerClick}
    />
  );

  // Letter-spacing and uppercase are for English only: they break Bangla conjuncts.
  const latinOnly = bn ? "" : "uppercase tracking-wider";

  if (compact) {
    return (
      <div className="space-y-3 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 min-[360px]:p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-black text-[var(--color-primary)] flex items-center gap-1.5 ${latinOnly}`}
          >
            <span aria-hidden="true">🔗</span>
            <span>{bn ? "বন্ধুদের লিংক পাঠান" : "Invite friends"}</span>
          </span>
          {copied ? (
            <span className="text-xs font-black text-emerald-700 animate-in fade-in flex items-center gap-1">
              <span aria-hidden="true">✓</span>
              <span>{bn ? "কপি হয়েছে!" : "Copied!"}</span>
            </span>
          ) : null}
        </div>

        {/* Full URL display */}
        <div
          onClick={handleCopy}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleCopy();
          }}
          className="group flex cursor-pointer items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/70 px-3 py-2 text-xs font-mono text-[var(--color-fg)] hover:border-[var(--color-primary)] transition-colors shadow-2xs"
        >
          <span className="truncate flex-1 select-all">{fullUrl}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className={`rounded-xl px-2.5 py-1 text-xs font-bold transition-all shrink-0 shadow-2xs ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-white text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
            }`}
          >
            {copied ? (bn ? "✓ কপি" : "✓ Copied") : bn ? "কপি" : "Copy"}
          </button>
        </div>

        {actions}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border-2 border-[var(--color-primary)]/30 bg-gradient-to-br from-white via-[var(--color-surface)] to-[var(--color-primary-light)]/20 p-3.5 min-[360px]:p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)]/10 px-3 py-0.5 text-xs font-black text-[var(--color-primary)]">
            <span aria-hidden="true">✨</span>
            <span>
              {bn ? "সদস্য যুক্ত করতে ইনভাইট করুন" : "Invite your group"}
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-[var(--color-fg)] tracking-tight">
            {bn ? "বন্ধুদের ট্রিপ লিংক পাঠান" : "Invite your friends to join"}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
            {bn
              ? "যাঁদের সাথে খরচ ভাগ করবেন তাঁদের এই লিংক পাঠান। কোনো অ্যাকাউন্ট বা পাসওয়ার্ড লাগবে না।"
              : "Share this link with your friends to split costs. No password or email needed."}
          </p>
        </div>
        <span aria-hidden="true" className="text-3xl shrink-0">
          🤝
        </span>
      </div>

      {/* Full Absolute URL Display */}
      <div className="space-y-1.5">
        <span
          className={`text-xs font-extrabold text-[var(--color-fg-muted)] block ${latinOnly}`}
        >
          {bn ? "সম্পূর্ণ ট্রিপ লিংক:" : "Full trip URL:"}
        </span>
        <div
          onClick={handleCopy}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleCopy();
          }}
          className="group flex cursor-pointer items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-3 min-[360px]:px-4 py-3 text-xs sm:text-sm font-mono text-[var(--color-fg)] shadow-2xs hover:border-[var(--color-primary)] transition-colors"
        >
          <span className="truncate flex-1 select-all">{fullUrl}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className={`rounded-xl px-3 min-[360px]:px-3.5 py-1.5 text-xs font-black transition-all shrink-0 active:scale-95 shadow-2xs ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            }`}
          >
            {copied
              ? bn
                ? "✓ কপি হয়েছে"
                : "✓ Copied"
              : bn
                ? "কপি লিংক"
                : "Copy link"}
          </button>
        </div>
      </div>

      {actions}
    </div>
  );
}
