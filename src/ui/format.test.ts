import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content";
import { bonusPreviewText, bonusRuleText, formatBreakdown, formatRate } from "./format";

const rates = {
  produced: { rice: 5, wood: 0.8 },
  eaten: { rice: 2, wood: 0 },
  net: { rice: 3, wood: 0.8 },
};

describe("format", () => {
  it("formats rates with a sign", () => {
    expect(formatRate(3)).toBe("+3.0/s");
    expect(formatRate(-0.5)).toBe("−0.5/s");
    expect(formatRate(0)).toBe("0.0/s");
  });

  it("explains where a rate comes from", () => {
    expect(formatBreakdown(rates, "rice")).toBe("+5.0 farmed · −2.0 eaten = +3.0/s");
    expect(formatBreakdown(rates, "wood")).toBe("+0.8 chopped = +0.8/s");
  });
});

describe("bonus text", () => {
  const content = loadContent();
  const def = (id: string) => content.buildings.find((b) => b.id === id)!;

  it("describes each building's adjacency bonus from its JSON", () => {
    expect(bonusRuleText(def("palayan"), content)).toBe("+10% next to the river or Palayan");
    expect(bonusRuleText(def("woodcutter-camp"), content)).toBe("+10% next to the forest");
    expect(bonusRuleText(def("bahay-kubo"), content)).toBeNull();
  });

  it("labels a ghost preview", () => {
    expect(bonusPreviewText(def("palayan"), 0.1)).toBe("+10% rice");
    expect(bonusPreviewText(def("woodcutter-camp"), 0.1)).toBe("+10% wood");
    expect(bonusPreviewText(def("palayan"), 0)).toBe("No bonus");
  });
});
