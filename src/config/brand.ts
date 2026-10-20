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

/**
 * Base64 data URI of public/brand/logo.svg for environments where relative URL fetching
 * fails or is unsupported (e.g. Satori in next/og and client-side html-to-image canvas capture).
 */
export const DOLBOL_LOGO_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJEb2xib2wiPgogIDx0aXRsZT5Eb2xib2w8L3RpdGxlPgogIDxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiByeD0iMTEyIiBmaWxsPSIjMGY2YjRhIi8+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjU2IDI1Nikgc2NhbGUoMSkgdHJhbnNsYXRlKC0yNTYgLTI1OCkiPgogICAgPGcgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjciPgogICAgICA8Y2lyY2xlIGN4PSIxMzIiIGN5PSIyNTAiIHI9IjM2Ii8+CiAgICAgIDxwYXRoIGQ9Ik03MiAzNThhNjAgNjAgMCAwIDEgMTIwIDB6Ii8+CiAgICAgIDxjaXJjbGUgY3g9IjM4MCIgY3k9IjI1MCIgcj0iMzYiLz4KICAgICAgPHBhdGggZD0iTTMyMCAzNThhNjAgNjAgMCAwIDEgMTIwIDB6Ii8+CiAgICA8L2c+CiAgICA8ZyBmaWxsPSIjZmZmIiBzdHJva2U9IiMwZjZiNGEiIHN0cm9rZS13aWR0aD0iMTYiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHBhaW50LW9yZGVyPSJzdHJva2UiPgogICAgICA8cGF0aCBkPSJNMTc2IDM1OGE4MCA4MCAwIDAgMSAxNjAgMHoiLz4KICAgIDwvZz4KICAgIDxnIGZpbGw9IiNmYmJmMjQiIHN0cm9rZT0iIzBmNmI0YSIgc3Ryb2tlLXdpZHRoPSIxNCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgcGFpbnQtb3JkZXI9InN0cm9rZSI+CiAgICAgIDxwYXRoIGQ9Ik0yNTYgMjY4QzI0MCAyNTAgMjA0IDIyOCAyMDQgMTk4QTUyIDUyIDAgMCAxIDMwOCAxOThDMzA4IDIyOCAyNzIgMjUwIDI1NiAyNjhaIi8+CiAgICA8L2c+CiAgICA8Y2lyY2xlIGN4PSIyNTYiIGN5PSIxOTgiIHI9IjE5IiBmaWxsPSIjMGY2YjRhIi8+CiAgPC9nPgo8L3N2Zz4=";
