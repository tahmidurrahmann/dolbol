/**
 * Unified scroll and focus management for the Add Expense card.
 *
 * Ensures the entire card is visible from its header, with the textarea
 * and submit button above the keyboard, respecting sticky header offsets
 * and iOS virtual keyboard viewports.
 */

let isCorrecting = false;
let activeCleanup: (() => void) | null = null;

export interface ScrollToAddExpenseOptions {
  cardId?: string;
  inputId?: string;
  headerOffset?: number;
}

export function scrollToAddExpense(options?: ScrollToAddExpenseOptions): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const cardId = options?.cardId ?? "ai-expense-card";
  const inputId = options?.inputId ?? "ai-expense-input";
  const headerOffset = options?.headerOffset ?? 68; // 60px sticky header + 8px margin

  const card = document.getElementById(cardId);
  if (!card) {
    return;
  }

  const input = document.getElementById(inputId) as
    | HTMLTextAreaElement
    | HTMLInputElement
    | null;

  // 1. Focus the textarea FIRST with preventScroll: true
  if (input && typeof input.focus === "function") {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }

  // 2. Respect prefers-reduced-motion
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";

  // 3. Scroll the CARD (not the textarea) into view from the start
  if (typeof card.scrollIntoView === "function") {
    card.scrollIntoView({ block: "start", behavior });
  }

  // 4. Clean up any pending visualViewport listener from a previous call
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  if (isCorrecting) {
    return;
  }

  // 5. On iOS Safari, the virtual keyboard opens after focus, resizing visualViewport.
  // Listen to visualViewport resize once to correct overshoot if the card header is hidden.
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return;
  }

  let ranCorrection = false;

  const onViewportResize = () => {
    if (ranCorrection) return;

    // Check if the card header is no longer fully visible below the sticky header
    const rect = card.getBoundingClientRect();
    if (rect.top < headerOffset - 4) {
      ranCorrection = true;
      isCorrecting = true;
      try {
        card.scrollIntoView({ block: "start", behavior });
      } finally {
        setTimeout(() => {
          isCorrecting = false;
        }, 300);
      }
    }

    cleanup();
  };

  const cleanup = () => {
    visualViewport.removeEventListener("resize", onViewportResize);
    clearTimeout(timeoutId);
    if (activeCleanup === cleanup) {
      activeCleanup = null;
    }
  };

  visualViewport.addEventListener("resize", onViewportResize, { once: true });
  const timeoutId = setTimeout(cleanup, 1200);
  activeCleanup = cleanup;
}
