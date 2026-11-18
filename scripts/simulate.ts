// Balance simulation: `npm run simulate [days] [seed]` plays the engine for N game days with a
// simple strategy (src/engine/simulate.ts) and prints the barangay's and its AI rivals' curves.
// `npm run simulate [days] [seed] -- --sessions=3` plays N real days instead, 3 hours a day,
// with offline progress for the rest of each day (as a regular player would).
import { loadContent } from "../src/engine/content";
import { simulate } from "../src/engine/simulate";
import { RENOWN_SOURCES } from "../src/engine/renown";

const args = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const hours = Number(process.argv.find((a) => a.startsWith("--sessions="))?.split("=")[1] ?? 0);
const sessions = hours > 0 ? { activeSeconds: hours * 3600 } : undefined;
const days = Number(args[0] ?? 200);
const seed = Number(args[1] ?? 12345);
const every = Math.max(1, Math.round(days / 40));
const content = loadContent();
const started = performance.now();
const { rows, firstIncomeAt, unlockTimes, firsts, milestones, raids, eatingRiceSeconds, pistas, levelTimes, levelAt, renownLog, renownByHour } = simulate(content, days, seed, sessions);

const cols: [string, (r: (typeof rows)[number]) => string | number][] = [
  ["Araw", (r) => r.day],
  ["food", (r) => r.food],
  ["diet", (r) => r.diet],
  ["rice", (r) => r.rice],
  ["cap", (r) => r.riceCap],
  ["wood", (r) => r.wood],
  ["wcap", (r) => r.woodCap],
  ["gold", (r) => r.gold],
  ["gcap", (r) => r.goldCap],
  ["people", (r) => r.villagers],
  ["bldgs", (r) => r.buildings],
  ["lvl", (r) => r.level],
  ["renown", (r) => r.renown],
  ["kubo$", (r) => r.kuboCost],
  ["hungry s", (r) => r.hungrySeconds],
  ["full s", (r) => r.fullSeconds],
  ["AI bldgs", (r) => r.aiBuildings],
  ["AI ppl", (r) => r.aiVillagers],
  ["AI lvl", (r) => r.aiLevel],
  ["AI ren", (r) => r.aiRenown],
  ["AI avg", (r) => r.aiAvgBuildings],
];
console.log(cols.map(([h]) => h.padStart(8)).join(""));
for (const r of rows) if (r.day % every === 0 || r.day === rows.length) console.log(cols.map(([, f]) => String(f(r)).padStart(8)).join(""));
console.log(`\nFirst automated income: ${firstIncomeAt === null ? "never" : `${Math.round(firstIncomeAt)} s`}`);
console.log(`Unlocks (minutes): ${unlockTimes.map((t) => (t / 60).toFixed(1)).join(", ")}`);
console.log(`New things in the first hour (minutes): ${milestones.filter((m) => m.t <= 3600).map((m) => `${(m.t / 60).toFixed(1)} ${m.what}`).join(", ")}`);
console.log(`First built (minutes): ${Object.entries(firsts).map(([k, t]) => `${k} ${(t / 60).toFixed(1)}`).join(", ")}`);
console.log(
  `Raids on the barangay: ${raids.defenses}, beaten off ${raids.won} (${raids.defenses ? Math.round((raids.won * 100) / raids.defenses) : 0}%), lost ${raids.lostRice} rice, ${raids.lostFood} food and ${raids.lostWood} wood`,
);
console.log(
  `Deaths per raid on us: ${raids.defenses ? ((raids.ourFallen) / raids.defenses).toFixed(2) : 0} ours, ${raids.defenses ? (raids.theirFallen / raids.defenses).toFixed(2) : 0} raiders'; our raids: ${raids.attacks}, won ${raids.attacks ? Math.round((raids.attacksWon * 100) / raids.attacks) : 0}%, our dead per raid ${raids.attacks ? (raids.attackFallen / raids.attacks).toFixed(2) : 0}`,
);
console.log(`Seconds eating Palay (no Pagkain): ${eatingRiceSeconds}; Pistas held: ${pistas}`);
console.log(`Barangay levels (minutes): ${levelTimes.map((t, i) => `${i + 1}: ${(t / 60).toFixed(1)}`).join(", ")}`);
if (sessions) console.log(`Barangay levels (hours of active play / real days): ${levelAt.map((l, i) => `${i + 1}: ${(l.active / 3600).toFixed(1)}h/${(l.real / 86400).toFixed(1)}d`).join(", ")}`);
// Renown by source in each hour of active play (time away counted with the hour it ends).
const hourly = renownByHour.map((h, i) => Object.fromEntries(RENOWN_SOURCES.map((src) => [src, (h[src] ?? 0) - (renownByHour[i - 1]?.[src] ?? 0)])));
const show = [0, 1, 2, 3, 5, 9, 19, 49, 99].filter((i) => i < hourly.length);
console.log(`Renown per hour of active play, by source (hour: ${RENOWN_SOURCES.join("/")}):`);
for (const i of show) console.log(`  ${String(i + 1).padStart(3)}: ${RENOWN_SOURCES.map((src) => hourly[i][src]).join("/")}`);
const total = renownByHour.at(-1) ?? {};
console.log(`Renown in total by source: ${RENOWN_SOURCES.map((src) => `${src} ${total[src] ?? 0}`).join(", ")}`);
console.log(`Renown in the first hour (minute source +amount): ${renownLog.map((r) => `${(r.t / 60).toFixed(1)} ${r.source} +${r.amount}`).join(", ")}`);
console.log(`(${days} days, seed ${seed}, ${((performance.now() - started) / 1000).toFixed(1)} s)`);
