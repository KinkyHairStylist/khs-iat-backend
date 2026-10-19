import { describe, expect, it } from "vitest";
import { containsPattern } from "../src/utils/sqlLike";

describe("containsPattern", () => {
  it("wraps plain text in wildcards", () => {
    expect(containsPattern("braids")).toBe("%braids%");
  });

  it("takes the user's own wildcards and backslashes literally", () => {
    expect(containsPattern("100%")).toBe(String.raw`%100\%%`);
    expect(containsPattern("a_b")).toBe(String.raw`%a\_b%`);
    expect(containsPattern(String.raw`a\b`)).toBe(String.raw`%a\\b%`);
  });
});
