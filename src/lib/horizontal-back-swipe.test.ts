import { describe, expect, it } from "vitest";
import { isHorizontalBackSwipe } from "./horizontal-back-swipe";

describe("Phase 14-B horizontal swipe back", () => {
  it("accepts a rightward edge swipe", () => {
    expect(isHorizontalBackSwipe(8, 200, 120, 206)).toBe(true);
  });

  it("rejects a swipe that does not start at the left edge", () => {
    expect(isHorizontalBackSwipe(80, 200, 200, 206)).toBe(false);
  });

  it("rejects a vertical drag", () => {
    expect(isHorizontalBackSwipe(8, 200, 90, 320)).toBe(false);
  });

  it("rejects a diagonal swipe", () => {
    expect(isHorizontalBackSwipe(8, 200, 140, 280)).toBe(false);
  });
});
