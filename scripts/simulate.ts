// Balance simulation: `npm run simulate [days] [seed]` plays the engine for N game days with a
// simple strategy (src/engine/simulate.ts) and prints the barangay's and its AI rivals' curves.
import { loadContent } from "../src/engine/content";
import { simulate } from "../src/engine/simulate";

const args = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const days = Number(args[0] ?? 200);
const seed = Number(args[1] ?? 12345);
const every = Math.max(1, Math.round(days / 40));
const content = loadContent();
const started = performance.now();
const { rows, firstIncomeAt, unlockTimes, firsts, milestones, raids, eatingRiceSeconds, pistas } = simulate(content, days, seed);

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
console.log(`(${days} days, seed ${seed}, ${((performance.now() - started) / 1000).toFixed(1)} s)`);
