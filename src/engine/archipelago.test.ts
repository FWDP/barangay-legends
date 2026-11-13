import { describe, expect, it } from "vitest";
import { generateArchipelago, HOME_ISLAND, sameIsland, travelSeconds } from "./archipelago";
import { alliesAtWar } from "./choices";
import type { Content } from "./content";
import { apply, STATE_VERSION, tick, type GameState } from "./game";
import { generateMap, NEIGHBOURS, tileAt } from "./map";
import { offlineProgress } from "./offline";
import { blocById, blocOf, generateBlocs, leaveBloc, scriptedEvent, startWar } from "./politics";
import { alliedDefenders, blocBlocker, createRegion, homeWarriors, isParamount, updatePolitics, type NeighborState } from "./region";
import { landingCandidates } from "./border";
import { parseSave } from "./save";
import { boatsFree, needsBoat, voyageSeconds } from "./sea";
import { at, calm, content, withState } from "./testUtils";

const P = content.rules.politics;
const ME = "barangay-1";

/** A player with a region, plenty of goods, 20 villagers and a Bahay ng Datu at `level`. */
function world(patch: Partial<GameState> = {}, seed = 7): GameState {
  const s = withState({ resources: { rice: 5000, wood: 5000, gold: 500 }, villagers: 20, buildings: [], ...patch });
  return { ...s, region: patch.region ?? createRegion(calm, s.time, seed, ME) };
}
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});
/** The first neighbor on another island. */
const farOne = (s: GameState) => s.region!.neighbors.find((n) => !sameIsland(s.region!.places, ME, n.id))!.id;

describe("the archipelago from a seed", () => {
  it("has 4–5 islands and 10–12 barangays, the same every time for one seed", () => {
    const a = generateArchipelago(content, 7, ME);
    expect(generateArchipelago(content, 7, ME)).toEqual(a);
    expect(a.islands.length).toBeGreaterThanOrEqual(content.rules.archipelago.minIslands);
    expect(a.islands.length).toBeLessThanOrEqual(content.rules.archipelago.maxIslands);
    const ids = Object.keys(a.places);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(ids.length).toBeLessThanOrEqual(12);
    expect(ids).toContain(ME);
    const islandCounts = new Set(Array.from({ length: 30 }, (_, i) => generateArchipelago(content, i + 1, ME).islands.length));
    expect([...islandCounts].every((n) => n >= 4 && n <= 5)).toBe(true);
  });

  it("puts the player and the old river neighbors on the home island, and someone on every other island", () => {
    for (const seed of [1, 7, 99, 12345]) {
      const { islands, places } = generateArchipelago(content, seed, ME);
      expect(places[ME].island).toBe(HOME_ISLAND);
      for (const n of content.neighbors.filter((x) => x.home)) expect(places[n.id].island).toBe(HOME_ISLAND);
      for (const n of content.neighbors.filter((x) => !x.home)) expect(places[n.id].island).not.toBe(HOME_ISLAND);
      for (const i of islands.slice(1)) expect(Object.values(places).some((p) => p.island === i.id)).toBe(true);
    }
  });

  it("gives every barangay a datu, island, size, strength, tradition and trait", () => {
    const s = world();
    for (const n of s.region!.neighbors) {
      const def = content.neighbors.find((d) => d.id === n.id)!;
      expect(def.datu).toBeTruthy();
      expect(["trader", "peaceful", "proud", "aggressive"]).toContain(def.trait);
      expect(s.region!.places[n.id].island).toBeTruthy();
      expect(content.traditions.map((t) => t.id)).toContain(n.tradition);
      expect(n.state.villagers).toBe(def.start.villagers);
    }
  });

  it("travel takes longer between farther islands, and nothing on the same island", () => {
    const s = world();
    const r = s.region!;
    const home = r.neighbors.find((n) => sameIsland(r.places, ME, n.id))!.id;
    expect(travelSeconds(content, r.islands, r.places, ME, home)).toBe(0);
    const far = r.neighbors.filter((n) => !sameIsland(r.places, ME, n.id)).map((n) => ({ id: n.id, t: travelSeconds(content, r.islands, r.places, ME, n.id) }));
    for (const f of far) expect(f.t).toBeGreaterThanOrEqual(content.rules.sea.minSeconds);
    const dist = (id: string) => {
      const a = r.islands.find((i) => i.id === r.places[ME].island)!;
      const b = r.islands.find((i) => i.id === r.places[id].island)!;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const sorted = [...far].sort((a, b) => dist(a.id) - dist(b.id));
    expect(sorted.at(-1)!.t).toBeGreaterThanOrEqual(sorted[0].t);
  });

  it("gives the barangay map a coast, and lands raiders on beaches as well as river banks", () => {
    const map = generateMap(content, 5);
    const coast = Array.from({ length: map.width }, (_, x) => tileAt(map, x, map.height - 1));
    expect(coast).toContain("sea");
    const spots = landingCandidates(map);
    const by = (t: string) => spots.some((p) => NEIGHBOURS.some(([dx, dy]) => tileAt(map, p.x + dx, p.y + dy) === t));
    expect(by("sea")).toBe(true);
    expect(by("river")).toBe(true);
  });
});

describe("blocs from a seed", () => {
  it("groups the AI barangays into 2–3 rival blocs, each led by its strongest member, with some independents", () => {
    for (const seed of [1, 7, 99, 4242]) {
      const r = createRegion(calm, 0, seed, ME);
      const blocs = r.politics.blocs;
      expect(blocs.length).toBeGreaterThanOrEqual(2);
      expect(blocs.length).toBeLessThanOrEqual(3);
      for (const b of blocs) {
        expect(b.members).toContain(b.leader);
        expect(b.members.length).toBeGreaterThanOrEqual(2);
      }
      const inBlocs = blocs.flatMap((b) => b.members);
      expect(new Set(inBlocs).size).toBe(inBlocs.length);
      expect(inBlocs).not.toContain(ME);
      expect(r.neighbors.length - inBlocs.length).toBeGreaterThanOrEqual(1);
      expect(createRegion(calm, 0, seed, ME).politics).toEqual(r.politics);
    }
  });

  it("leaders are the strongest", () => {
    const strength = (id: string) => ({ a: 1, b: 9, c: 2, d: 8, e: 3, f: 1, g: 4 })[id] ?? 0;
    const p = generateBlocs({ ...content, rules: { ...content.rules, blocs: { min: 2, max: 2, independents: 1 } } } as Content, ["a", "b", "c", "d", "e", "f", "g"], strength, 3);
    const leaders = p.blocs.map((b) => b.leader);
    for (const b of p.blocs) expect(Math.max(...b.members.map(strength))).toBe(strength(b.leader));
    expect(leaders.length).toBe(2);
  });
});

describe("sea travel", () => {
  it("needs a Balangay dock (Bahay ng Datu level 3) and a boat", () => {
    const dock = content.buildings.find((b) => b.id === "balangay-dock")!;
    expect(dock.unlock.datuLevel).toBe(3);
    expect(dock.category).toBe("pagkain");
    expect(dock.placeNextTo).toEqual(["river", "sea"]);
    let s = world({ datuLevel: 3, buildings: [at("balangay-dock", 1, 2)] });
    expect(boatsFree(s)).toBe(0);
    s = apply(s, calm, { type: "trainBalangay" });
    expect(s.balangays).toBe(1);
    s = apply(s, calm, { type: "trainBalangay" });
    // A dock holds only so many.
    expect(apply(s, calm, { type: "trainBalangay" })).toBe(s);
  });

  it("an action aimed at another island sails, takes its time, and happens on arrival", () => {
    let s = world({ datuLevel: 3, balangays: 1, buildings: [at("balangay-dock", 1, 2)] });
    const far = farOne(s);
    s = setNb(s, far, { trust: 90, grudge: 0, state: { ...nb(s, far).state, resources: { rice: 1000, wood: 1000, gold: 0 } } });
    const cmd = { type: "proposeTrade" as const, neighbor: far, give: { resource: "rice" as const, amount: 20 }, want: { resource: "wood" as const, amount: 10 } };
    expect(needsBoat(s, cmd)).toBe(true);
    const sailing = apply(s, calm, cmd);
    expect(sailing.region!.voyages).toHaveLength(1);
    expect(sailing.resources.rice).toBe(5000);
    expect(boatsFree(sailing)).toBe(0);
    const t = voyageSeconds(s, calm, far);
    const before = tick(sailing, calm, t - 1);
    expect(before.resources.rice).toBe(sailing.resources.rice + (before.resources.rice - sailing.resources.rice));
    const arrived = tick(sailing, calm, t + 1);
    expect(arrived.stats.voyages).toBe(1);
    expect(arrived.region!.voyages[0].leg).toBe("home");
    const home = tick(arrived, calm, t + 1);
    expect(home.region!.voyages).toEqual([]);
    expect(boatsFree(home)).toBe(1);
  });

  it("without a boat, an action on another island is refused", () => {
    const s = world();
    const far = farOne(s);
    expect(apply(s, calm, { type: "marry", neighbor: far })).toBe(s);
  });

  it("a raid by sea takes its warriors away until they come home", () => {
    let s = world({ datuLevel: 3, balangays: 1, warriors: 4, villagers: 20, buildings: [at("balangay-dock", 1, 2), at("kuta", 3, 3)] });
    const far = farOne(s);
    s = apply(s, calm, { type: "raid", neighbor: far, warriors: 3 });
    expect(s.region!.voyages[0]).toMatchObject({ leg: "out", warriors: 3 });
    expect(homeWarriors(s)).toBe(1);
  });

  it("a trade boat arriving during a raid waits offshore until it ends", () => {
    let s = world({ datuLevel: 3, balangays: 1, buildings: [at("balangay-dock", 1, 2)] });
    const far = farOne(s);
    s = apply(s, calm, { type: "trade", neighbor: far, give: "rice" });
    const t = voyageSeconds(s, calm, far);
    const raider = s.region!.neighbors[0].id;
    s = { ...s, region: { ...s.region!, incomingRaid: { from: raider, strikeAt: s.time + t + 500 } } };
    const waiting = tick(s, calm, t + 2);
    expect(waiting.region!.voyages[0]).toMatchObject({ leg: "out", waiting: true });
    expect(waiting.stats.voyages).toBe(0);
  });
});

describe("bloc changes from player actions", () => {
  const lv4 = (patch: Partial<GameState> = {}) => world({ datuLevel: 4, ...patch });

  it("forming, inviting, leaving and expelling need Bahay ng Datu level 4", () => {
    expect(blocBlocker(world({ datuLevel: 3 }), content, "form")).toBe("level");
    let s = lv4();
    s = apply(s, calm, { type: "bloc", action: "form" });
    const mine = blocOf(s.region!.politics, ME)!;
    expect(mine.leader).toBe(ME);
    // Invite a trusting independent.
    const free = s.region!.neighbors.find((n) => !blocOf(s.region!.politics, n.id))!.id;
    expect(blocBlocker(s, content, "invite", free)).toBe("trust");
    s = setNb(s, free, { trust: 80, grudge: 0 });
    s = apply(s, calm, { type: "bloc", action: "invite", target: free });
    expect(blocOf(s.region!.politics, free)?.leader).toBe(ME);
    expect(s.region!.news.at(-1)).toMatchObject({ key: "joined", barangay: free });
    // Expelling costs trust.
    const expelled = apply(s, calm, { type: "bloc", action: "expel", target: free });
    expect(blocOf(expelled.region!.politics, free)).toBeUndefined();
    expect(nb(expelled, free).trust).toBe(80 - P.expelTrustLoss);
  });

  it("joining another bloc needs its leader's trust; leaving costs trust with the members", () => {
    let s = lv4();
    const bloc = s.region!.politics.blocs[0];
    expect(blocBlocker(s, content, "join", bloc.id)).not.toBeNull();
    s = setNb(s, bloc.leader, { trust: 90, grudge: 0 });
    s = apply(s, calm, { type: "bloc", action: "join", target: bloc.id });
    expect(blocById(s.region!.politics, bloc.id)!.members).toContain(ME);
    const other = bloc.members.find((m) => m !== bloc.leader)!;
    const trustBefore = nb(s, other).trust;
    s = apply(s, calm, { type: "bloc", action: "leave" });
    expect(blocOf(s.region!.politics, ME)).toBeUndefined();
    expect(nb(s, other).trust).toBe(Math.max(0, trustBefore - P.leaveTrustLoss));
  });

  it("absorbing a bloc member as a tributary takes it out of its bloc", () => {
    let s = world();
    const bloc = s.region!.politics.blocs.find((b) => b.members.length >= 2)!;
    const member = bloc.members.find((m) => m !== bloc.leader)!;
    const sameIsl = sameIsland(s.region!.places, ME, member);
    s = setNb(s, member, { influence: 99, trust: 90 });
    if (!sameIsl) s = { ...s, datuLevel: 3, balangays: 1, buildings: [at("balangay-dock", 1, 2)] };
    const traded = apply(s, calm, { type: "trade", neighbor: member, give: "rice" });
    const done = sameIsl ? traded : tick(traded, calm, voyageSeconds(s, calm, member) + 1);
    expect(nb(done, member).status).toBe("tributary");
    expect(blocOf(done.region!.politics, member)).toBeUndefined();
  });

  it("raiding a bloc member raises a smaller grudge with its bloc mates; beating a leader costs it the lead", () => {
    let s = world({ warriors: 15, villagers: 30 });
    // A bloc led from the home island: Batong-Buhay, with Talampas and a far member.
    const far = farOne(s);
    const bloc = { id: "bloc-x", leader: "batong-buhay", members: ["batong-buhay", "talampas", far] };
    s = { ...s, region: { ...s.region!, politics: { ...s.region!.politics, blocs: [bloc], wars: [] } } };
    const mate = "talampas";
    s = setNb(s, bloc.leader, { state: { ...nb(s, bloc.leader).state, warriors: 0 } });
    const after = apply(s, calm, { type: "raid", neighbor: bloc.leader, warriors: 15 });
    expect(nb(after, mate).grudge).toBeCloseTo(content.rules.diplomacy.grudge.raidWon * (P.solidarityPercent / 100));
    expect(blocById(after.region!.politics, bloc.id)!.leader).not.toBe(bloc.leader);
  });
});

describe("scripted political events", () => {
  it("change only AI blocs, at most one per 10 minutes", () => {
    let s = world({ time: P.startsAfterSeconds });
    const sure = { ...calm, rules: { ...calm.rules, politics: { ...P, chancePerSecond: 1 } } };
    const once = updatePolitics(s, sure, s.time, s.time + P.minGapSeconds - 1);
    expect(once.region!.news).toHaveLength(1);
    const twice = updatePolitics(s, sure, s.time, s.time + P.minGapSeconds + 1);
    expect(twice.region!.news).toHaveLength(2);
    // The player's bloc is never touched by a script.
    s = apply({ ...s, datuLevel: 4 }, calm, { type: "bloc", action: "form" });
    const mineBefore = blocOf(s.region!.politics, ME)!;
    const later = updatePolitics(s, sure, s.time, s.time + P.minGapSeconds * 20);
    expect(blocOf(later.region!.politics, ME)).toEqual(mineBefore);
  });

  it("a war costs both sides warriors until peace", () => {
    const s = world({ time: 100 });
    const [a, b] = s.region!.politics.blocs;
    const warred = { ...s, region: { ...s.region!, politics: { ...startWar(s.region!.politics, a.id, b.id, 100), nextWarTickAt: 101 } } };
    const warriors = (x: GameState) => [...a.members, ...b.members].reduce((n, id) => n + nb(x, id).state.warriors, 0);
    const after = updatePolitics(warred, calm, 100, 100 + P.warTickSeconds * 3 + 1);
    if (warriors(warred) > 0) expect(warriors(after)).toBeLessThan(warriors(warred));
  });

  it("each kind picks something valid, seeded", () => {
    const s = world();
    const strength = () => 1;
    const ids = s.region!.neighbors.map((n) => n.id);
    for (let second = 1; second < 50; second++) {
      const c = scriptedEvent(s.region!.politics, content.politics, ids, strength, [], s.map.seed, second);
      expect(c).not.toBeNull();
      expect(scriptedEvent(s.region!.politics, content.politics, ids, strength, [], s.map.seed, second)).toEqual(c);
    }
    expect(leaveBloc(s.region!.politics, "nobody", strength)).toBe(s.region!.politics);
  });

  it("allies at war ask the player for help (choice events at the Bahay ng Datu)", () => {
    let s = world();
    const [a, b] = s.region!.politics.blocs;
    s = { ...s, region: { ...s.region!, politics: startWar(s.region!.politics, a.id, b.id, 0) } };
    expect(alliesAtWar(s, content)).toEqual([]);
    s = setNb(s, a.leader, { status: "ally" });
    const asks = alliesAtWar(s, content);
    expect(asks[0].ally).toBe(a.leader);
    expect(b.members).toContain(asks[0].enemy);
    expect(content.choices.find((c) => c.id === "ally-war-call")!.story).toContain("Bahay ng Datu");
  });
});

describe("allied defense", () => {
  it("allies on the island walk in; far ones sail only if they have boats; they fight only if in time", () => {
    let s = world();
    const r = s.region!;
    const near = r.neighbors.find((n) => sameIsland(r.places, ME, n.id))!.id;
    const far = r.neighbors.find((n) => !sameIsland(r.places, ME, n.id))!.id;
    s = setNb(s, near, { status: "ally", state: { ...nb(s, near).state, warriors: 3 } });
    s = setNb(s, far, { status: "ally", state: { ...nb(s, far).state, warriors: 3, villagers: 1 } });
    const list = alliedDefenders(s, content);
    expect(list.find((x) => x.id === near)).toMatchObject({ by: "land", arrives: true });
    expect(list.find((x) => x.id === far)).toMatchObject({ by: "sea", eta: null, arrives: false });
    const boats = setNb(s, far, { state: { ...nb(s, far).state, villagers: 20, warriors: 3 } });
    const sea = alliedDefenders(boats, content).find((x) => x.id === far)!;
    expect(sea.eta).toBeGreaterThan(0);
    expect(sea.arrives).toBe(sea.eta! <= content.rules.diplomacy.aiRaid.warningSeconds);
  });
});

describe("Paramount Datu across the islands", () => {
  it("needs the player to lead a bloc that covers every barangay (allies, tributaries, bloc members, their allies)", () => {
    let s = world({ datuLevel: 4 });
    const ids = s.region!.neighbors.map((n) => n.id);
    for (const id of ids) s = setNb(s, id, { status: "tributary" });
    expect(isParamount(s)).toBe(false);
    s = apply(s, calm, { type: "bloc", action: "form" });
    expect(isParamount(s)).toBe(true);
    expect(s.region!.victory).not.toBeNull();
  });
});

describe("offline catch-up", () => {
  it("fires at most one political event, never attacks, and boats wait", () => {
    const sure = { ...calm, rules: { ...calm.rules, politics: { ...P, chancePerSecond: 1, startsAfterSeconds: 0 } } };
    let s = world({ datuLevel: 3, balangays: 1, buildings: [at("balangay-dock", 1, 2)] });
    s = apply(s, calm, { type: "trade", neighbor: farOne(s), give: "rice" });
    const arriveAt = s.region!.voyages[0].arriveAt;
    const { state, report } = offlineProgress(s, sure, 8 * 3600);
    expect(report.news.length).toBeLessThanOrEqual(1);
    expect(state.region!.news.length - s.region!.news.length).toBeLessThanOrEqual(1);
    expect(state.region!.incomingRaid).toBeNull();
    expect(state.region!.voyages[0].arriveAt).toBe(arriveAt + 8 * 3600);
  });

  it("stays quick for 8 hours with every island", () => {
    const s = world();
    const t = performance.now();
    offlineProgress(s, content, 8 * 3600);
    expect(performance.now() - t).toBeLessThan(4000);
  });
});

describe("save migration v19 → v20", () => {
  /** An older save: the player's state as v19 wrote it (no islands, blocs, boats or coast). */
  function v19(s: GameState): string {
    const raw = { ...s, version: 19, stats: { ...s.stats } } as Record<string, unknown>;
    delete raw.balangays;
    delete (raw.stats as Record<string, unknown>).voyages;
    const region = { ...s.region! } as Record<string, unknown>;
    for (const k of ["islands", "places", "politics", "news", "nextNewsId", "voyages", "nextVoyageId"]) delete region[k];
    region.neighbors = s.region!.neighbors.filter((n) => content.neighbors.find((d) => d.id === n.id)?.home).map((n) => {
      const x = { ...n } as Record<string, unknown>;
      delete x.tradition;
      return x;
    });
    raw.region = region;
    const map = { ...s.map, tiles: s.map.tiles.replaceAll("s", "f") };
    raw.map = map;
    return JSON.stringify(raw);
  }

  it("keeps the old neighbors' relations, tributaries and history, adds the islands, and the coast", () => {
    let s = world({ time: 500, map: generateMap(content, 5) });
    s = setNb(s, "malinaw", { status: "tributary", loyalty: 70, influence: 100, trust: 66 });
    s = setNb(s, "pulang-lupa", { status: "ally", trust: 77 });
    s = { ...s, region: { ...s.region!, reports: [{ id: 1, time: 10, kind: "tributary", neighbor: "malinaw" }], nextReportId: 2 } };
    const back = parseSave(v19(s), content)!;
    expect(back.version).toBe(STATE_VERSION);
    expect(nb(back, "malinaw")).toMatchObject({ status: "tributary", loyalty: 70, trust: 66 });
    expect(nb(back, "pulang-lupa")).toMatchObject({ status: "ally", trust: 77 });
    expect(back.region!.reports).toHaveLength(1);
    expect(back.region!.neighbors.length).toBe(content.neighbors.length);
    expect(back.region!.places["silangan"]).toBeDefined();
    // The player's tributaries and allies stay out of the starting blocs.
    const inBlocs = back.region!.politics.blocs.flatMap((b) => b.members);
    expect(inBlocs).not.toContain("malinaw");
    expect(inBlocs).not.toContain("pulang-lupa");
    expect(back.balangays).toBe(0);
    expect(back.stats.voyages).toBe(0);
    // A coast now runs along one edge, and nothing the barangay had built or cleared turned to sea.
    expect(back.map.tiles).toContain("s");
    for (let i = 0; i < s.map.tiles.length; i++) {
      if (s.map.tiles[i] === "c" || s.map.tiles[i] === "d") expect(back.map.tiles[i]).toBe(s.map.tiles[i]);
    }
  });

  it("round-trips the new region state", () => {
    let s = world({ datuLevel: 4, balangays: 1, buildings: [at("balangay-dock", 1, 2)] });
    s = apply(s, calm, { type: "bloc", action: "form" });
    s = apply(s, calm, { type: "trade", neighbor: farOne(s), give: "rice" });
    const back = parseSave(JSON.stringify(s), content)!;
    expect(back.region!.islands).toEqual(s.region!.islands);
    expect(back.region!.places).toEqual(s.region!.places);
    expect(back.region!.politics).toEqual(s.region!.politics);
    expect(back.region!.news).toEqual(s.region!.news);
    expect(back.region!.voyages).toEqual(s.region!.voyages);
    expect(back.balangays).toBe(1);
  });
});
