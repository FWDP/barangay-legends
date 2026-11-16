import { describe, expect, it } from "vitest";
import type { GameState } from "../engine/game";
import { createRegion } from "../engine/region";
import { acquainted, at, calm, withState } from "../engine/testUtils";
import { activeBanners } from "./EventBanners";
import { arrange, endingSoon, noticeQueue, statusIcons, type Notice } from "./notices";

const ctx = { expeditionFresh: false, sailing: false };
const world = (patch: Partial<GameState> = {}): GameState => {
  const s = withState({ resources: { rice: 100, wood: 100, gold: 0 }, villagers: 8, ...patch });
  return { ...s, region: acquainted(createRegion(calm, s.time, 7)) };
};

describe("notifications", () => {
  it("put action-now events first, then trade and diplomacy, then information", () => {
    let s = world({ time: 700, buildings: [at("bahay-kubo", 5, 3), { ...at("palayan", 3, 5), burningSince: 699 }, { ...at("palayan", 2, 2), damaged: true }] });
    s = { ...s, eclipse: { endsAt: 760, taps: 0 } };
    s = { ...s, region: { ...s.region!, incomingRaid: { from: "batong-buhay", strikeAt: 760 }, offer: null } };
    s = { ...s, choice: { id: "x", neighbor: null, at: 0 } };
    const q = noticeQueue(s, calm, { ...ctx, expeditionFresh: true });
    expect(q[0].id).toBe("eclipse");
    expect(q.map((n) => n.tier)).toEqual([...q.map((n) => n.tier)].sort());
    expect(q.findIndex((n) => n.id === "fire")).toBeLessThan(q.findIndex((n) => n.id === "raid"));
    expect(q.find((n) => n.id === "damaged")!.tier).toBe(2);
    // A raid holds back the choice events.
    expect(q.some((n) => n.id === "choice")).toBe(false);
    const calmDay = { ...s, region: { ...s.region!, incomingRaid: null } };
    expect(noticeQueue(calmDay, calm, ctx).some((n) => n.id === "choice")).toBe(true);
  });

  it("show ONE banner; the rest wait; a pick from the list comes forward, but never over an action-now event", () => {
    const q: Notice[] = [{ id: "raid", tier: 0 }, { id: "offer", tier: 1, expiresAt: 50 }, { id: "damaged", tier: 2, dismissKey: "d:1" }];
    const a = arrange(q, new Set(), null);
    expect(a.shown!.id).toBe("raid");
    expect(a.waiting.map((n) => n.id)).toEqual(["offer", "damaged"]);
    expect(arrange(q, new Set(), "damaged").shown!.id).toBe("raid");
    expect(arrange(q.slice(1), new Set(), "damaged").shown!.id).toBe("damaged");
    // Dismissed information goes; when the banner is handled, the next one shows.
    expect(arrange(q.slice(1), new Set(["d:1"]), null).waiting).toEqual([]);
    expect(arrange(q.slice(2), new Set(["d:1"]), null).shown).toBeNull();
  });

  it("the badge tells when a waiting offer is about to run out", () => {
    const q: Notice[] = [{ id: "offer", tier: 1, expiresAt: 110 }];
    expect(endingSoon(q, 100)).toBe(true);
    expect(endingSoon(q, 50)).toBe(false);
  });

  it("make ongoing states status icons, not banners", () => {
    let s = world({ mourning: 40 });
    s = { ...s, region: { ...s.region!, incomingRaid: { from: "batong-buhay", strikeAt: 9999 }, neighbors: s.region!.neighbors.map((n, i) => (i === 0 ? { ...n, grudge: 100 } : n)) } };
    s = { ...s, blessings: { "anito-blessing": { until: s.time + 100, cooldownUntil: s.time + 200 } as never } };
    const ids = statusIcons(s, calm).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["mourning", "embargo", "tradePaused", "blessings"]));
    expect(activeBanners(s, calm).some((b) => b.id === "mourning" || b.id === "season")).toBe(false);
    // While trade is paused the offer waits as a status, not a banner.
    const offered = { ...s, region: { ...s.region!, offer: { from: "malinaw", give: { resource: "rice" as const, amount: 20 }, want: { resource: "wood" as const, amount: 20 }, expiresAt: s.time + 60 } } };
    expect(noticeQueue(offered, calm, ctx).some((n) => n.id === "offer")).toBe(false);
  });
});

describe("tapping notifications (V.5)", () => {
  it("the badge is a button, a banner that does something is tappable, and they sit above the map's labels", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NoticeStack, NOTICE_LAYER, NOTICE_LIST_LAYER } = await import("./NoticeStack");
    const { loadUiContent } = await import("./uiContent");
    const { withState: ws, content: c } = await import("../engine/testUtils");
    const game = loadUiContent(c).game;
    const s = ws({});
    const queue = [
      { id: "offer", tier: 1 as const, expiresAt: 50 },
      { id: "choice", tier: 1 as const },
    ];
    const views = {
      offer: { node: createElement("span", null, "A bangka waits"), label: "Offer", onOpen: () => {} },
      choice: { node: createElement("span", null, "A choice"), label: "Choice", onOpen: () => {} },
    };
    const html = renderToStaticMarkup(createElement(NoticeStack, { state: s, queue, views, game, lang: "en" }));
    // The shown banner (the offer) opens on a tap.
    expect(html).toMatch(/data-notice="offer"[^>]*role="button"|role="button"[^>]*data-notice="offer"/);
    expect(html).toContain('tabindex="0"');
    // The "+1" badge is a real button.
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>\+?1|<button[^>]*aria-expanded="false"/);
    // Layers above the map's chips (z-10) and labels (z-20).
    const z = (c: string) => Number(c.replace("z-", ""));
    expect(z(NOTICE_LAYER)).toBeGreaterThan(20);
    expect(z(NOTICE_LIST_LAYER)).toBeGreaterThan(z(NOTICE_LAYER));
    expect(html).toContain(NOTICE_LIST_LAYER);
  });
});
