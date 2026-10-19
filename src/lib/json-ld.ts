import { BRAND } from "@/config/brand";
import { ACTIVE_LANDING_META } from "@/config/seo";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Builds the Schema.org JSON-LD structure for the landing page.
 * Strictly includes only WebSite and WebApplication schemas.
 * Never includes ratings, reviews, or unverified claims.
 */
export function buildLandingJsonLd(locale: "bn" | "en") {
  const isBn = locale === "bn";
  const siteUrlString = getSiteUrl("/").toString();
  const meta = ACTIVE_LANDING_META[isBn ? "bn" : "en"];
  const brandName = BRAND.name[isBn ? "bn" : "en"];
  const inLanguage = isBn ? "bn-BD" : "en-US";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: brandName,
        alternateName: [...BRAND.alternateNames],
        url: siteUrlString,
        inLanguage,
      },
      {
        "@type": "WebApplication",
        name: brandName,
        url: siteUrlString,
        description: meta.description,
        applicationCategory: "TravelApplication",
        operatingSystem: "Any",
        inLanguage,
        // TODO(owner): Add `offers`: { "@type": "Offer", "price": "0", "priceCurrency": "BDT" } once confirmed free tier.
      },
    ],
  };
}

/**
 * Serializes JSON-LD to a string and safely escapes '<' as '\\u003c'
 * to prevent XSS / script breaking in HTML.
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
