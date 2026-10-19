"use client";

import { useEffect, useState, type ReactNode } from "react";

export function HeaderNav({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      aria-label="Main Navigation"
      className={`flex min-h-[48px] sm:min-h-[50px] items-center justify-between gap-2 sm:gap-3 rounded-2xl px-3 sm:px-5 py-1.5 transition-all duration-200 ${
        scrolled
          ? "border border-gray-200/90 bg-white/95 shadow-xs backdrop-blur-md"
          : "border border-transparent bg-transparent shadow-none"
      }`}
    >
      {children}
    </nav>
  );
}
