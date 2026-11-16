// Connection marks (V.6): the footprints on buildings joined by a Daan are hidden by default,
// shown with the Daan tool, while placing a building, or when "Show connections" is on (saved).
import { describe, expect, it } from "vitest";
import { connectionMarksShown } from "./BarangayMap";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("connection marks", () => {
  it("are hidden by default", () => {
    expect(DEFAULT_SETTINGS.showConnections).toBe(false);
    expect(connectionMarksShown({ setting: DEFAULT_SETTINGS.showConnections, roadTool: false, placing: false })).toBe(false);
  });

  it("show with the Daan tool, while placing, or with the setting on", () => {
    expect(connectionMarksShown({ setting: false, roadTool: true, placing: false })).toBe(true);
    expect(connectionMarksShown({ setting: false, roadTool: false, placing: true })).toBe(true);
    expect(connectionMarksShown({ setting: true, roadTool: false, placing: false })).toBe(true);
  });

  it("remembers the choice", () => {
    expect(parseSettings(JSON.stringify({ showConnections: true })).showConnections).toBe(true);
    expect(parseSettings(JSON.stringify({ showConnections: "yes" })).showConnections).toBe(false);
  });
});
