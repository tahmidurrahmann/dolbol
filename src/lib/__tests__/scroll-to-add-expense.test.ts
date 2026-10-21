import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scrollToAddExpense } from "@/lib/scroll-to-add-expense";

describe("scrollToAddExpense", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  it("does nothing when the card element is missing", () => {
    const focusSpy = vi.fn();
    const mockElements: Record<string, unknown> = {
      "ai-expense-input": {
        focus: focusSpy,
      },
    };

    globalThis.window = {
      matchMedia: vi.fn(),
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      getElementById: vi.fn((id: string) => mockElements[id] ?? null),
    } as unknown as Document;

    scrollToAddExpense();

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("calls focus with preventScroll true and scrollIntoView with block 'start'", () => {
    const focusSpy = vi.fn();
    const scrollSpy = vi.fn();

    const mockCard = {
      id: "ai-expense-card",
      scrollIntoView: scrollSpy,
      getBoundingClientRect: vi.fn(() => ({
        top: 68,
        bottom: 250,
      })),
    };

    const mockInput = {
      id: "ai-expense-input",
      focus: focusSpy,
    };

    const mockElements: Record<string, unknown> = {
      "ai-expense-card": mockCard,
      "ai-expense-input": mockInput,
    };

    globalThis.window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      visualViewport: null,
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      getElementById: vi.fn((id: string) => mockElements[id] ?? null),
    } as unknown as Document;

    const callOrder: string[] = [];
    focusSpy.mockImplementation(() => {
      callOrder.push("focus");
    });
    scrollSpy.mockImplementation(() => {
      callOrder.push("scrollIntoView");
    });

    scrollToAddExpense();

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollSpy).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(callOrder).toEqual(["focus", "scrollIntoView"]);
  });

  it("respects prefers-reduced-motion using behavior 'auto'", () => {
    const scrollSpy = vi.fn();
    const mockCard = {
      id: "ai-expense-card",
      scrollIntoView: scrollSpy,
      getBoundingClientRect: vi.fn(() => ({ top: 68 })),
    };
    const mockInput = {
      id: "ai-expense-input",
      focus: vi.fn(),
    };

    const mockElements: Record<string, unknown> = {
      "ai-expense-card": mockCard,
      "ai-expense-input": mockInput,
    };

    globalThis.window = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
      visualViewport: null,
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      getElementById: vi.fn((id: string) => mockElements[id] ?? null),
    } as unknown as Document;

    scrollToAddExpense();

    expect(scrollSpy).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  });

  it("listens to visualViewport resize and runs the correction at most once if card header is cut off", () => {
    const scrollSpy = vi.fn();
    const mockCard = {
      id: "ai-expense-card",
      scrollIntoView: scrollSpy,
      getBoundingClientRect: vi.fn(() => ({
        top: 20, // less than headerOffset (68) -> cut off under sticky header
        bottom: 200,
      })),
    };

    const mockInput = {
      id: "ai-expense-input",
      focus: vi.fn(),
    };

    const mockElements: Record<string, unknown> = {
      "ai-expense-card": mockCard,
      "ai-expense-input": mockInput,
    };

    const viewportState: { onResize?: () => void } = {};

    const mockVisualViewport = {
      addEventListener: vi.fn((event: string, fn: () => void) => {
        if (event === "resize") viewportState.onResize = fn;
      }),
      removeEventListener: vi.fn((event: string) => {
        if (event === "resize") delete viewportState.onResize;
      }),
    };

    globalThis.window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      visualViewport: mockVisualViewport,
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      getElementById: vi.fn((id: string) => mockElements[id] ?? null),
    } as unknown as Document;

    scrollToAddExpense();

    // 1st call from scrollToAddExpense()
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
      { once: true }
    );

    // Simulate iOS keyboard opening resize event
    const triggerResize = viewportState.onResize;
    expect(triggerResize).toBeDefined();
    if (triggerResize) {
      triggerResize();
    }

    // Correction ran once
    expect(scrollSpy).toHaveBeenCalledTimes(2);

    // Triggering resize again does NOT run a 3rd correction (no loop)
    if (triggerResize) {
      triggerResize();
    }
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });
});
