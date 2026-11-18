import { describe, expect, it } from "vitest";
import type { GameState } from "../engine/game";
import { createRegion } from "../engine/region";
import { acquainted, at, calm, withState } from "../engine/testUtils";
import { activeBanners } from "./EventBanners";
import { arrange, endingSoon, noticeQueue, pickFromList, statusIcons, type Notice } from "./notices";

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

  it("a minimized banner becomes a pill and lets the next one show; it never goes while its event lasts", () => {
    const q: Notice[] = [{ id: "raid", tier: 0, expiresAt: 30 }, { id: "offer", tier: 1, paused: true }, { id: "damaged", tier: 2, dismissKey: "d:1" }];
    const a = arrange(q, new Set(), null, new Set(["raid"]));
    expect(a.pills.map((n) => n.id)).toEqual(["raid"]);
    expect(a.shown!.id).toBe("offer");
    expect(a.waiting.map((n) => n.id)).toEqual(["damaged"]);
    // Everything minimized: only pills.
    const all = arrange(q.slice(0, 1), new Set(), null, new Set(["raid"]));
    expect(all).toEqual({ shown: null, pills: [q[0]], waiting: [] });
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
    // While trade is paused a waiting offer stays in the queue, marked paused, with no countdown.
    const offered = { ...s, region: { ...s.region!, offer: { from: "malinaw", give: { resource: "rice" as const, amount: 20 }, want: { resource: "wood" as const, amount: 20 }, expiresAt: s.time + 60 } } };
    const held = noticeQueue(offered, calm, ctx).find((n) => n.id === "offer");
    expect(held).toMatchObject({ paused: true });
    expect(held!.expiresAt).toBeUndefined();
    expect(noticeQueue(offered, calm, ctx)[0].id).toBe("raid");
  });
});

describe("minimizing banners", () => {
  it("a big banner has a minimize button; minimized, it is a pill with icon, short title, countdown and its buttons", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NoticeStack } = await import("./NoticeStack");
    const { loadUiContent } = await import("./uiContent");
    const { withState: ws, content: c } = await import("../engine/testUtils");
    const game = loadUiContent(c).game;
    const s = ws({ time: 100 });
    const queue = [{ id: "raid", tier: 0 as const, expiresAt: 118 }, { id: "offer", tier: 1 as const, paused: true }];
    const views = {
      raid: { node: createElement("span", null, "Raid in 0:18"), label: "Raid", pill: { icon: "⚔️", title: "Raid", actions: [{ label: "Call everyone", tip: "All warriors", onClick: () => {} }] } },
      offer: { node: createElement("span", null, "A bangka waits"), label: "Offer · Trade paused until the raid ends" },
    };
    const full = renderToStaticMarkup(createElement(NoticeStack, { state: s, queue, views, game, lang: "en" }));
    expect(full).toContain('data-minimize="raid"');
    expect(full).toContain("Raid in 0:18");
    const ui = { dismissed: new Set<string>(), front: null, open: true, minimized: new Set(["raid"]), kept: new Set<string>(), set: () => {} };
    const small = renderToStaticMarkup(createElement(NoticeStack, { state: s, queue, views, game, lang: "en", ui }));
    expect(small).toContain('data-pill="raid"');
    expect(small).toContain("0:18");
    expect(small).toContain("Call everyone");
    expect(small).not.toContain("Raid in 0:18");
    // The paused offer now has the banner slot, and says trade is paused.
    expect(small).toContain("A bangka waits");
  });

  it("the queued paused offer shows it waits, with no countdown", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NoticeList } = await import("./NoticeStack");
    const { loadUiContent } = await import("./uiContent");
    const { withState: ws, content: c } = await import("../engine/testUtils");
    const game = loadUiContent(c).game;
    const s = ws({ time: 100 });
    const views = { offer: { node: createElement("span", null, "A bangka waits"), label: `Offer · ${game.offer.paused.en}` } };
    const html = renderToStaticMarkup(createElement(NoticeList, { waiting: [{ id: "offer", tier: 1 as const, paused: true }], views, state: s, label: "Also", onPick: () => {} }));
    expect(html).toContain("Trade paused until the raid ends");
    expect(html).toContain("⏸");
    expect(html).not.toMatch(/\d:\d\d/);
  });
});

describe("the +N list while a banner is up", () => {
  it("a queued item can be opened while an action-now banner is active, and leaves the list", () => {
    const queue: Notice[] = [{ id: "typhoon", tier: 0 }, { id: "offer", tier: 1, expiresAt: 150 }, { id: "choice", tier: 1 }];
    const before = arrange(queue, new Set(), null);
    expect(before.shown!.id).toBe("typhoon");
    expect(before.waiting.map((n) => n.id)).toEqual(["offer", "choice"]);
    // Picking the trade offer brings it forward; the typhoon steps aside to its pill, never gone.
    const picked = pickFromList(queue, { front: null, minimized: new Set() }, "offer", () => true);
    const after = arrange(queue, new Set(), picked.front, picked.minimized);
    expect(after.shown!.id).toBe("offer");
    expect(after.pills.map((n) => n.id)).toEqual(["typhoon"]);
    expect(after.waiting.map((n) => n.id)).toEqual(["choice"]);
    // Then the visitor: the offer goes back to the list, the choice is the banner.
    const next = pickFromList(queue, picked, "choice", () => true);
    const third = arrange(queue, new Set(), next.front, next.minimized);
    expect(third.shown!.id).toBe("choice");
    expect(third.waiting.map((n) => n.id)).toEqual(["offer"]);
    // A banner with no pill to step aside to stays shown, and the pick waits behind it.
    const stuck = pickFromList(queue, { front: null, minimized: new Set() }, "offer", () => false);
    expect(arrange(queue, new Set(), stuck.front, stuck.minimized).shown!.id).toBe("typhoon");
  });

  it("each item in the list is a button that opens it", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NoticeList } = await import("./NoticeStack");
    const { withState: ws } = await import("../engine/testUtils");
    const views = { offer: { node: null, label: "🛶 Trade offer" }, choice: { node: null, label: "📜 Someone waits" } };
    const html = renderToStaticMarkup(
      createElement(NoticeList, { waiting: [{ id: "offer", tier: 1 as const, expiresAt: 50 }, { id: "choice", tier: 1 as const }], views, state: ws({}), label: "Also", onPick: () => {} }),
    );
    expect(html.match(/<button[^>]*data-notice-item="(offer|choice)"/g)).toHaveLength(2);
    expect(html).toContain("pointer-events-auto");
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
    // Layers above the map's chips (z-10), labels (z-20) and production numbers; the open list above everything.
    const z = (c: string) => Number(c.replace(/^z-\[?(\d+)\]?$/, "$1"));
    const { FLOAT_LAYER, INFO_FLOAT_LAYER } = await import("./floats");
    expect(z(NOTICE_LAYER)).toBeGreaterThan(20);
    expect(z(FLOAT_LAYER)).toBeLessThan(z(NOTICE_LAYER));
    expect(z(NOTICE_LIST_LAYER)).toBeGreaterThan(z(NOTICE_LAYER));
    expect(z(NOTICE_LIST_LAYER)).toBeGreaterThan(z(INFO_FLOAT_LAYER));
    // Hud backdrops and menus go up to z-[60]: the list is above them too.
    expect(z(NOTICE_LIST_LAYER)).toBeGreaterThan(60);
  });
});
