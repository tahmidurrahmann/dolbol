"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === "production") {
      const buildId = process.env.NEXT_PUBLIC_APP_BUILD_ID || "prod-build";
      const swUrl = `/sw.js?buildId=${encodeURIComponent(buildId)}`;
      navigator.serviceWorker.register(swUrl).catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    } else {
      // In development mode, unregister any service worker registered during previous production tests on localhost
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      // Also clean up any app-cache entries created on localhost
      if ("caches" in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            if (name.startsWith("app-cache-")) {
              caches.delete(name);
            }
          }
        });
      }
    }
  }, []);

  return null;
}
