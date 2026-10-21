import { describe, it, expect } from "vitest";
import bnMessages from "@/messages/bn.json";
import enMessages from "@/messages/en.json";

function extractKeyPaths(
  obj: Record<string, unknown>,
  prefix = ""
): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...extractKeyPaths(value as Record<string, unknown>, currentPath));
    } else {
      keys.push(currentPath);
    }
  }
  return keys;
}

function extractStringLeaves(
  obj: Record<string, unknown>,
  prefix = ""
): Array<{ path: string; value: string }> {
  const leaves: Array<{ path: string; value: string }> = [];
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      leaves.push({ path: currentPath, value });
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      leaves.push(...extractStringLeaves(value as Record<string, unknown>, currentPath));
    }
  }
  return leaves;
}

describe("Message keys symmetry and integrity", () => {
  it("enforces 1:1 key structure symmetry between bn.json and en.json", () => {
    const bnKeys = new Set(extractKeyPaths(bnMessages as Record<string, unknown>));
    const enKeys = new Set(extractKeyPaths(enMessages as Record<string, unknown>));

    const missingInBn = [...enKeys].filter((key) => !bnKeys.has(key));
    const missingInEn = [...bnKeys].filter((key) => !enKeys.has(key));

    expect(
      missingInBn,
      `Keys present in en.json but missing in bn.json: ${missingInBn.join(", ")}`
    ).toEqual([]);

    expect(
      missingInEn,
      `Keys present in bn.json but missing in en.json: ${missingInEn.join(", ")}`
    ).toEqual([]);

    expect(bnKeys.size).toBeGreaterThan(0);
    expect(bnKeys.size).toBe(enKeys.size);
  });

  it("fails when an artificial asymmetry is introduced", () => {
    const mockBn: Record<string, unknown> = {
      common: { ok: "ঠিক আছে" },
    };
    const mockEn: Record<string, unknown> = {
      common: { ok: "OK", extraKey: "Extra" },
    };

    const bnKeys = new Set(extractKeyPaths(mockBn));
    const enKeys = new Set(extractKeyPaths(mockEn));

    const missingInBn = [...enKeys].filter((k) => !bnKeys.has(k));
    expect(missingInBn).toEqual(["common.extraKey"]);
  });

  it("ensures no message string uses JavaScript template syntax ${", () => {
    const bnStrings = extractStringLeaves(bnMessages as Record<string, unknown>);
    const enStrings = extractStringLeaves(enMessages as Record<string, unknown>);

    const badBn = bnStrings.filter((item) => item.value.includes("${"));
    const badEn = enStrings.filter((item) => item.value.includes("${"));

    expect(
      badBn,
      `Found JS template literal syntax \${ in bn.json: ${JSON.stringify(badBn)}`
    ).toEqual([]);

    expect(
      badEn,
      `Found JS template literal syntax \${ in en.json: ${JSON.stringify(badEn)}`
    ).toEqual([]);
  });
});
