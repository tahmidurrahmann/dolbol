/**
 * Landing page SEO title and description options.
 * Graphemes counted via Intl.Segmenter:
 * - Titles: max 60 graphemes (aiming < 50 for Bangla due to pixel width)
 * - Descriptions: max 155 graphemes
 * Themes: ট্যুরের খরচের হিসাব, বন্ধুদের সাথে খরচ ভাগ, কে কাকে কত দেবে, লগইন ছাড়া
 */
export const LANDING_META_OPTIONS = {
  option1: {
    bn: {
      title: "দলবল | বন্ধুদের ট্যুরের খরচের হিসাব ও ভাগাভাগি",
      description:
        "লগইন ছাড়াই বন্ধুদের সাথে ট্যুরের খরচ ভাগ করুন। বাংলায় খরচ লিখলেই দলবল নিমেষেই হিসাব করে দেখাবে কে কাকে কত দেবে।",
    },
    en: {
      title: "Dolbol | Group Trip Expense Splitter & Settle Up",
      description:
        "Split group travel costs with friends without any login. Add expenses naturally and instantly see who owes whom in whole BDT.",
    },
  },
  option2: {
    bn: {
      title: "দলবল | বন্ধুদের সাথে খরচ ভাগ ও কে কাকে কত দেবে",
      description:
        "কোনো পাসওয়ার্ড বা একাউন্ট ছাড়াই বন্ধুদের গ্রুপ ট্যুরের সব খরচ সহজে ট্র্যাক করুন। পূর্ণ টাকায় নিখুঁত ও ঝামেলাহীন হিসাব।",
    },
    en: {
      title: "Dolbol | Easy Trip Expense Sharing with Friends",
      description:
        "Track vacation costs and fair settle-ups with friends. No sign-up required, zero decimal confusion, and instant balance calculations.",
    },
  },
} as const;

// Option 1 is active by default until chosen otherwise
export const ACTIVE_LANDING_META = LANDING_META_OPTIONS.option1;
