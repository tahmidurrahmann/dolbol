import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import {
  BANGLA_DIGIT_CHARS,
  banglaToAsciiDigits,
  normalizeNameKey,
} from "@/lib/names";

export { BANGLA_DIGIT_CHARS, banglaToAsciiDigits, normalizeNameKey };


/**

 * Generates a cryptographically random URL-safe slug (16 bytes = 22 base64url chars).

 */

export function generateTripSlug(): string {
  return randomBytes(16).toString("base64url");
}

/**

 * Generates a cryptographically random raw session token (32 bytes = 43 base64url chars).

 */

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**

 * Computes the SHA-256 hex digest of a raw session token for storage in MemberSession.tokenHash.

 */

export function hashSessionToken(rawToken: string): string {
  if (!rawToken || rawToken.trim().length === 0) {
    throw new Error("Session token cannot be empty.");
  }

  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**

 * Normalizes a member displayName into a canonical nameKey for per-trip uniqueness checks:

 * NFC unicode normalization, collapsed internal whitespace, trimmed, and lowercased.

 */


/**

 * Normalizes and validates an optional 4-to-6 digit PIN (accepting either Bangla or ASCII digits).

 * Returns null if pin is empty/undefined; throws RangeError if non-empty and invalid.

 */

export function normalizePin(rawPin: string | null | undefined): string | null {
  if (!rawPin) {
    return null;
  }

  const trimmed = banglaToAsciiDigits(rawPin.trim());

  if (trimmed.length === 0) {
    return null;
  }

  if (!/^\d{4,6}$/.test(trimmed)) {
    throw new RangeError("PIN must be 4 to 6 digits.");
  }

  return trimmed;
}

/**

 * Hashes a 4-to-6 digit PIN using scrypt with a 16-byte random salt.

 */

export function hashPin(rawPin: string): string {
  const normalized = normalizePin(rawPin);

  if (!normalized) {
    throw new RangeError("PIN must be 4 to 6 digits.");
  }

  const salt = randomBytes(16).toString("hex");

  const derived = scryptSync(normalized, salt, 64).toString("hex");

  return `scrypt:${salt}:${derived}`;
}

/**

 * Verifies a candidate PIN against a stored scrypt hash in constant time.

 */

export function verifyPin(candidatePin: string, storedHash: string): boolean {
  let normalized: string | null = null;

  try {
    normalized = normalizePin(candidatePin);
  } catch {
    return false;
  }

  if (!normalized) {
    return false;
  }

  const parts = storedHash.split(":");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const salt = parts[1];

  const expectedHex = parts[2];

  if (!salt || !expectedHex) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, "hex");

  const candidateBuf = scryptSync(normalized, salt, 64);

  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, candidateBuf);
}

/**

 * Extracts a clean trip slug from either a pasted full URL (e.g. https://.../trips/abc-123)

 * or a raw slug string. Returns null if invalid.

 */

export function extractSlugFromInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/\/trips\/([A-Za-z0-9_-]{8,64})(?:[/?#]|$)/);

  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
