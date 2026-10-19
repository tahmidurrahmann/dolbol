import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Real last-modified constant manually updated on site content releases.
// Never use new Date() per request to avoid misleading search crawlers.
export const LAST_MODIFIED = new Date("2026-10-19T00:00:00.000Z");

interface PublicRouteEntry {
  path: string;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}

// Single array driving public indexable pages for easy addition of future pages.
// NEVER include /trips/*, /dev/*, or /api/* here.
const PUBLIC_ROUTES: readonly PublicRouteEntry[] = [
  {
    path: "/",
    changeFrequency: "weekly",
    priority: 1.0,
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: getSiteUrl(route.path).toString(),
    lastModified: LAST_MODIFIED,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
