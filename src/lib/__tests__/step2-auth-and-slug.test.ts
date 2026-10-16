import { describe, expect, it } from "vitest";

import {
  banglaToAsciiDigits,
  extractSlugFromInput,
  generateSessionToken,
  generateTripSlug,
  hashPin,
  hashSessionToken,
  normalizeNameKey,
  normalizePin,
  verifyPin,
} from "@/lib/crypto";

describe("generateTripSlug & generateSessionToken", () => {
  it("generates URL-safe 22-char base64url trip slugs that are unique", () => {
    const slugA = generateTripSlug();

    const slugB = generateTripSlug();

    expect(slugA).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect(slugB).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect(slugA).not.toBe(slugB);
  });

  it("generates 43-char base64url session tokens and deterministic 64-char SHA-256 hex hashes", () => {
    const raw = generateSessionToken();

    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const hash1 = hashSessionToken(raw);

    const hash2 = hashSessionToken(raw);

    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    expect(hash1).toBe(hash2);

    expect(hash1).not.toBe(raw);
  });
});

describe("normalizeNameKey", () => {
  it("trims, collapses internal spaces, and lowercases Latin and Bangla names", () => {
    expect(normalizeNameKey("  Rahim   Ahmed  ")).toBe("rahim ahmed");

    expect(normalizeNameKey("RAHIM ahmed")).toBe("rahim ahmed");

    expect(normalizeNameKey("  রহিম   আহমেদ ")).toBe("রহিম আহমেদ");
  });
});

describe("PIN normalization, scrypt hashing, and verification", () => {
  it("converts Bangla digits in PINs to ASCII digits", () => {
    expect(banglaToAsciiDigits("১২৩৪")).toBe("1234");

    expect(normalizePin(" ১২৩৪ ")).toBe("1234");

    expect(normalizePin("")).toBeNull();

    expect(normalizePin(null)).toBeNull();
  });

  it("rejects non-numeric or out-of-range PIN lengths", () => {
    expect(() => normalizePin("123")).toThrow(RangeError);

    expect(() => normalizePin("1234567")).toThrow(RangeError);

    expect(() => normalizePin("12a4")).toThrow(RangeError);
  });

  it("hashes a PIN with random salt and verifies both ASCII and Bangla digit inputs", () => {
    const hash = hashPin("১২৩৪");

    expect(hash.startsWith("scrypt:")).toBe(true);

    expect(verifyPin("1234", hash)).toBe(true);

    expect(verifyPin("১২৩৪", hash)).toBe(true);

    expect(verifyPin("9999", hash)).toBe(false);

    expect(verifyPin("invalid", hash)).toBe(false);
  });
});

describe("extractSlugFromInput", () => {
  it("extracts slug from full URLs or raw slugs and rejects invalid strings", () => {
    expect(
      extractSlugFromInput("https://triphub.bd/trips/AbCdEfGhIjKlMnOpQrStUv"),
    ).toBe("AbCdEfGhIjKlMnOpQrStUv");

    expect(
      extractSlugFromInput(
        "http://localhost:3000/trips/AbCdEfGhIjKlMnOpQrStUv?ref=wa",
      ),
    ).toBe("AbCdEfGhIjKlMnOpQrStUv");

    expect(extractSlugFromInput("  AbCdEfGhIjKlMnOpQrStUv  ")).toBe(
      "AbCdEfGhIjKlMnOpQrStUv",
    );

    expect(extractSlugFromInput("short")).toBeNull();

    expect(extractSlugFromInput("")).toBeNull();
  });
});
