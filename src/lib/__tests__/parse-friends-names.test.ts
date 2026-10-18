import { describe, expect, it } from "vitest";
import { parseFriendsNames } from "@/lib/trips";

describe("parseFriendsNames", () => {
  it("splits simple comma-separated names", () => {
    const result = parseFriendsNames("tahmidur, sakib");
    expect(result).toEqual(["tahmidur", "sakib"]);
  });

  it("keeps multi-word single name as one person when no delimiter is present", () => {
    const result = parseFriendsNames("tahmidur rahman sakib");
    expect(result).toEqual(["tahmidur rahman sakib"]);
  });

  it("handles multi-word names with comma separation properly", () => {
    const result = parseFriendsNames("tahmidur rahman sakib, wasiur");
    expect(result).toEqual(["tahmidur rahman sakib", "wasiur"]);
  });

  it("handles semicolons, colons, slashes, and pipes as delimiters", () => {
    const result = parseFriendsNames("Karim; Tanvir / Nusrat | Shakil");
    expect(result).toEqual(["Karim", "Tanvir", "Nusrat", "Shakil"]);
  });

  it("handles Bengali Dari (।) as delimiter", () => {
    const result = parseFriendsNames("করিম। তানভীর। নুসরাত");
    expect(result).toEqual(["করিম", "তানভীর", "নুসরাত"]);
  });

  it("handles newline separated names", () => {
    const result = parseFriendsNames("Karim\nTanvir\r\nNusrat");
    expect(result).toEqual(["Karim", "Tanvir", "Nusrat"]);
  });

  it("preserves hyphenated names like Al-Amin while splitting on hyphens with surrounding spaces", () => {
    const result = parseFriendsNames(
      "Al-Amin - Fatema-Tuz-Zohra - Kazi Nazrul-Islam",
    );
    expect(result).toEqual([
      "Al-Amin",
      "Fatema-Tuz-Zohra",
      "Kazi Nazrul-Islam",
    ]);
  });

  it("strips bullet list markers (- , • , * )", () => {
    const result = parseFriendsNames("- Karim\n- Tanvir\n• Nusrat\n* Shakil");
    expect(result).toEqual(["Karim", "Tanvir", "Nusrat", "Shakil"]);
  });

  it("handles English numbered lists (1., 2), 3-)", () => {
    const result1 = parseFriendsNames("1. Karim 2. Tanvir 3. Nusrat");
    expect(result1).toEqual(["Karim", "Tanvir", "Nusrat"]);

    const result2 = parseFriendsNames("1) Karim 2) Tanvir");
    expect(result2).toEqual(["Karim", "Tanvir"]);

    const result3 = parseFriendsNames("1- Karim 2- Tanvir");
    expect(result3).toEqual(["Karim", "Tanvir"]);
  });

  it("handles Bengali numbered lists (১., ২., ৩.)", () => {
    const result = parseFriendsNames("১. করিম ২. তানভীর ৩. নুসরাত");
    expect(result).toEqual(["করিম", "তানভীর", "নুসরাত"]);
  });

  it("handles conjunctions (and, &, +, এবং, ও) with surrounding spaces", () => {
    const resultEn = parseFriendsNames("Karim and Tanvir & Nusrat + Shakil");
    expect(resultEn).toEqual(["Karim", "Tanvir", "Nusrat", "Shakil"]);

    const resultBn = parseFriendsNames("করিম এবং তানভীর ও নুসরাত");
    expect(resultBn).toEqual(["করিম", "তানভীর", "নুসরাত"]);
  });

  it("splits on non-honorific periods while preserving honorifics and initials", () => {
    // Normal sentences or periods separating friends
    const resultDots = parseFriendsNames("Tahmidur. Sakib. Wasiur");
    expect(resultDots).toEqual(["Tahmidur", "Sakib", "Wasiur"]);

    // Honorifics and initials must NOT be split
    const resultHonorifics = parseFriendsNames(
      "Md. Sakib, Dr. Kamal, Prof. Rahman, Engr. Shakil, A. K. M. Tahmidur",
    );
    expect(resultHonorifics).toEqual([
      "Md. Sakib",
      "Dr. Kamal",
      "Prof. Rahman",
      "Engr. Shakil",
      "A. K. M. Tahmidur",
    ]);
  });

  it("deduplicates case-insensitively and ignores creator name", () => {
    const result = parseFriendsNames("Tahmidur, Sakib, sakib, SAKIB, Wasiur", {
      creatorName: "Tahmidur",
    });
    expect(result).toEqual(["Sakib", "Wasiur"]);
  });

  it("respects maxCount limit", () => {
    const names = Array.from({ length: 40 }, (_, i) => `Friend ${i + 1}`).join(
      ", ",
    );
    const result = parseFriendsNames(names, { maxCount: 10 });
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("Friend 1");
    expect(result[9]).toBe("Friend 10");
  });

  it("returns empty array for empty, undefined, or punctuation-only input", () => {
    expect(parseFriendsNames("")).toEqual([]);
    expect(parseFriendsNames("   ")).toEqual([]);
    expect(parseFriendsNames(undefined)).toEqual([]);
    expect(parseFriendsNames(null)).toEqual([]);
    expect(parseFriendsNames(",,, ;; ... ---")).toEqual([]);
  });
});
