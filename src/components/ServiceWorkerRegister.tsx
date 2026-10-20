"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      const buildId = process.env.NEXT_PUBLIC_APP_BUILD_ID || "prod-build";
      const swUrl = `/sw.js?buildId=${encodeURIComponent(buildId)}`;
      navigator.serviceWorker.register(swUrl).catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
