export const BRAND = {
  name: {
    bn: "দলবল",
    en: "Dolbol",
  },
  descriptor: {
    bn: "ট্রিপ ও খরচ",
    en: "Trip & Costs",
  },
  tagline: {
    bn: "দলবল নিয়ে ঘুরি, হিসাব রাখি",
    en: "Plan the trip. Split the costs.",
  },
  previousNames: ["Trip Hub", "ট্রিপ হাব"] as const,
  alternateNames: ["Dolbol", "দলবল"] as const,
  themeColor: "#0f6b4a",
} as const;

export type Brand = typeof BRAND;
