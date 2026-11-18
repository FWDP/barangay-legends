import { describe, expect, it } from "vitest";
import { chooseSide, coverage, type Box } from "./noticeSide";

const b = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });
const topBanner = b(10, 60, 360, 140);
const bottomBanner = b(10, 600, 360, 680);

describe("banners keep clear of the raid", () => {
  it("measures how much of the landing and the raiders' way a box covers", () => {
    expect(coverage(topBanner, [b(100, 100, 120, 120)])).toBe(400);
    expect(coverage(topBanner, [b(100, 300, 120, 320)])).toBe(0);
    expect(coverage(null, [b(0, 0, 10, 10)])).toBe(0);
  });

  it("stay at the top unless they would cover the landing or the raiders' path, then move to the bottom", () => {
    const none = { top: null, bottom: null };
    expect(chooseSide("top", topBanner, none, [])).toBe("top");
    expect(chooseSide("top", topBanner, none, [b(200, 400, 240, 440)])).toBe("top");
    const upriver = [b(150, 0, 200, 90), b(150, 90, 200, 180), b(140, 300, 220, 380)];
    expect(chooseSide("top", topBanner, none, upriver)).toBe("bottom");
    // At the bottom they stay while the top would still cover the raid…
    expect(chooseSide("bottom", bottomBanner, { top: topBanner, bottom: null }, upriver)).toBe("bottom");
    // …and go back up once it's clear (the raid over, or the camera moved).
    expect(chooseSide("bottom", bottomBanner, { top: topBanner, bottom: null }, [b(150, 300, 200, 380)])).toBe("top");
  });

  it("when both sides cover the raid, take the one that covers less, without flipping back and forth", () => {
    const both = [b(0, 60, 400, 70), b(0, 600, 400, 680)];
    // Top covers less than the bottom: from the bottom it goes up, and stays up.
    expect(chooseSide("bottom", bottomBanner, { top: topBanner, bottom: null }, both)).toBe("top");
    expect(chooseSide("top", topBanner, { top: topBanner, bottom: bottomBanner }, both)).toBe("top");
    // Bottom covers less: it goes down and stays down.
    const mostlyTop = [b(0, 60, 400, 140), b(0, 670, 400, 680)];
    expect(chooseSide("top", topBanner, { top: null, bottom: null }, mostlyTop)).toBe("bottom");
    expect(chooseSide("bottom", bottomBanner, { top: topBanner, bottom: bottomBanner }, mostlyTop)).toBe("bottom");
  });
});
