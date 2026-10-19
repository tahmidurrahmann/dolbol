/**
 * Helper returning the site URL object.
 * Every absolute URL in metadata, sitemap, robots, and JSON-LD must come from here.
 */
export function getSiteUrl(pathname = "/"): URL {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const base = envUrl.endsWith("/") ? envUrl : `${envUrl}/`;
  const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return new URL(cleanPath, base);
}

export const siteUrl: URL = getSiteUrl();
