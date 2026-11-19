// Content schema and validation. Buildings, events and balance rules live in content/ as JSON.
import type { Curve } from "./curve";

/** Pagkain (everyday food), Palay (rice: a prestige grain), wood, gold, Asin (salt) and rice wine (tapay). */
export const RESOURCES = ["food", "rice", "wood", "gold", "salt", "wine"] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceAmounts = Partial<Record<Resource, number>>;

/** Where a food is kept (food.ts): root crops in the ground, fresh food that spoils, or dried and preserved. */
export const FOOD_KINDS = ["root", "fresh", "dried"] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];
/** Food groups for a varied diet: starches, fish and shellfish, meat, fruit and greens. */
export const FOOD_GROUPS = ["starch", "fish", "meat", "fruit"] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export interface FoodRules {
  riceWastePercent: number;
  aiRiceReserve: number;
  datuRicePerLevel: number;
  groundPerPlot: number;
  jarsPerHouse: number;
  livePerBaklad: number;
  datuStorePerLevel: ResourceAmounts;
  spoilPercentPerMinute: number;
  smokePerHousePerSecond: number;
  saltPerHousePerSecond: number;
  saltPreservesPerUnit: number;
  variety: { perGroupHappiness: number; monotonySeconds: number; monotonyHappiness: number; monotonySickPercent: number };
  kaingin: { fertileHarvest: number; fallowBalance: number };
  depletion: { radius: number; perUnit: number; recoveryPerMinute: number; maxPenaltyPercent: number };
  /** Percent of a building's yield by season id and building id. */
  seasonYield: Record<string, Record<string, number>>;
  /** Seasons of rough seas (shown in the HUD). */
  roughSeas: string[];
  typhoonFreshPercent: number;
  brew: { ricePerWine: number };
  pista: { cost: ResourceAmounts; happiness: number; happinessSeconds: number; renown: number; trust: number; cooldownSeconds: number };
  migration: { foodSharePercent: number; graceSeconds: number };
}

export interface PestRules {
  startsAfterSeconds: number;
  ratsChancePerSecond: number;
  ratsPercent: number;
  locustChancePerSecond: number;
  locustWarningSeconds: number;
  locustSeconds: number;
  locustPercent: number;
  boarChancePerSecond: number;
  boarSeconds: number;
  boarPercent: number;
  boarStock: number;
  boarGuardRadius: number;
  cooldownSeconds: number;
}
/** An amount of every resource. */
export type Resources = Record<Resource, number>;

/** Map features a building can be next to (besides other buildings). */
export const TERRAINS = ["river", "forest", "sea"] as const;
export type TerrainFeature = (typeof TERRAINS)[number];

export interface AdjacencyBonus {
  /** Terrain features or building ids that trigger the bonus when orthogonally adjacent. */
  nextTo: string[];
  /** Extra production, in percent, while the condition holds. Applies once, not per neighbour. */
  percent: number;
}

/** One level a placed building can be raised to (a Kamalig's bigger granary). */
export interface BuildingUpgrade {
  level: number;
  cost: ResourceAmounts;
  /** Storage the copy holds at this level (replaces the level-1 storage). */
  storage?: ResourceAmounts;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Position in the build menu (lower first). Files without one go last, by file name. */
  order?: number;
  /** The build menu tab it appears under (presentation only); unknown or missing goes under "Iba pa". */
  category?: string;
  /** A labelled group within its tab (ui.json game.build.groups), shown after a divider: "valued" goods (Palay, Asin). */
  menuGroup?: string;
  cost: ResourceAmounts;
  /** What it costs to fix after a fire or typhoon damages it. */
  repairCost: ResourceAmounts;
  /** Sick villagers recover this much faster per building (100 = twice as fast). */
  heals?: { percentFaster: number };
  /** Output per second for each assigned worker. */
  produces?: ResourceAmounts;
  /** Worker slots per copy of the building. */
  workers?: number;
  /** Villager capacity added per copy. */
  housing?: number;
  /** The Kuta: the rally point and shelter in a raid; also its share of a barangay's strength in wars between barangays. */
  defense?: number;
  /** A Bantayan: when staffed, it watches the landing points within rules.watch.radius (watch.ts). */
  watch?: boolean;
  /** Suyak: sharpened stakes that slow raiders landing within rules.watch.stakes.radius (watch.ts). */
  stakes?: boolean;
  /** Food it brings in (produces.food): where it's kept (food.ts) and its food group (variety). */
  foodKind?: FoodKind;
  foodGroup?: FoodGroup;
  /** Root crops in the ground, or a sago stand: a typhoon can't damage it. */
  typhoonProof?: boolean;
  /** How much likelier a typhoon is to flatten it (bananas, rice): default 1. */
  typhoonWeight?: number;
  /** Fishing and hunting grounds wear out when worked too hard (rules.food.depletion). */
  depletes?: boolean;
  /** A kaingin: its soil tires after rules.food.kaingin.fertileHarvest and must be rested. */
  wearsOut?: boolean;
  /** A Baklad: keeps caught fish alive (rules.food.livePerBaklad). */
  keepsFishAlive?: boolean;
  adjacencyBonus?: AdjacencyBonus;
  /** Where it can be built. Default "cleared" land; a bridge goes on the river. */
  placeOn?: "cleared" | "river";
  /** A bridge turns up to maxSpan river tiles into a crossing, opening the far bank. */
  bridge?: { maxSpan: number };
  /** It must stand next to (side by side, not diagonally) one of these terrains, e.g. a Fishing Dock by the river. */
  placeNextTo?: string[];
  /** Works at the normal rate at night (night fishing); other buildings slow down at night. */
  nightWork?: boolean;
  /** Storage added per copy at level 1 (a Kamalig). */
  storage?: ResourceAmounts;
  /** Levels a placed copy can be raised to (2, 3…), each with its cost and the storage it then holds. */
  upgrades?: BuildingUpgrade[];
  /** A shrine (the Dambana): where offerings and rituals happen. */
  shrine?: boolean;
  /** It must stand within `radius` tiles (straight line) of a standing building of this type. */
  requiresNear?: { building: string; radius: number };
  /** The Bahay ng Datu: one house at the plaza, raised level by level (never placed like others). */
  datuHouse?: DatuHouseDef;
  /** A resting place for the dead (the Libingan): mourning passes this much faster with one. */
  burial?: { mourningPercentFaster: number };
  /** Available from the start, once the barangay has this many villagers, or at a Bahay ng Datu level. */
  unlock: { start?: boolean; villagers?: number; datuLevel?: number };
  /** A Balangay dock: each one keeps `boats` balangay, trained for `boatCost`. */
  balangayDock?: { boats: number; boatCost: ResourceAmounts };
  sources: string[];
}

export interface Rules {
  start: {
    resources: ResourceAmounts;
    villagers: number;
    buildings: Record<string, number>;
  };
  baseHousing: number;
  /** Pagkain each villager eats a second (children less: population.ts). */
  foodEatenPerVillagerPerSecond: number;
  /** How each copy's price rises: base × (1 + linear·n + quadratic·n²) after n copies (curve.ts). */
  costCurve: Curve;
  gatherPerClick: number;
  secondsPerNewVillager: number;
  /** When there are more villagers than houses shelter (a house was demolished), one leaves this often. */
  secondsPerVillagerLeavingOvercrowded: number;
  placement: PlacementRules;
  map: MapRules;
  clearing: ClearingRules;
  military: MilitaryRules;
  /** The Bantayan's watch (watch.ts). */
  watch: { radius: number; watchedWarningSeconds: number; unwatchedWarningSeconds: number; revealUnwatchedSeconds: number; stakes: { radius: number; secondsEach: number; maxSeconds: number } };
  /** Calling for help with the tambuli (region.ts callForHelp). */
  tambuli: { volunteerPercent: number; distancePenaltyPerUnit: number; smallRaidAttackers: number; cooldownSeconds: number; overuseTrust: number };
  /** The Kuta: the rally, the ready bonus and the shelter (border.ts, region.ts). */
  kuta: { rallySeconds: number; readySeconds: number; readyBonus: number; shelterRadius: number; shelteredLootPercent: number };
  diplomacy: DiplomacyRules;
  choices: ChoiceRules;
  offline: OfflineRules;
  roads: RoadRules;
  staffing: StaffingRules;
  /** Resources the Gather buttons can give. */
  gatherable: Resource[];
  dayNight: { daySeconds: number; nightFrom: number; nightTo: number; nightProductionFactor: number; eveningShare: number; moonCycleDays: number };
  /** The Bakunawa challenge's rhythm, scaling and the villagers' own strikes (worship.ts gong). */
  eclipse: {
    beatSeconds: number;
    onBeatWindowSeconds: number;
    onBeat: number;
    offBeat: number;
    holdBeat: number;
    mashGapSeconds: number;
    strengthPerLevel: number;
    autoStrikes: Record<string, number>;
    autoPerDatuLevel: number;
  };
  worship: WorshipRules;
  forest: ForestRules;
  death: DeathRules;
  archipelago: { minIslands: number; maxIslands: number };
  blocs: { min: number; max: number; independents: number };
  sea: { secondsPerUnit: number; minSeconds: number; raidWarriorsPerBoat: number };
  politics: PoliticsRules;
  allyDefense: { landSeconds: number; landSecondsPerUnit: number; balangayMinVillagers: number; tributarySendPercent: number };
  /** An ally raided: its messenger's call for help (region.ts allyCall). */
  allyCalls: { startsAfterSeconds: number; chancePerSecond: number; cooldownSeconds: number; warningSeconds: number; sendPercent: number; renown: number; ignoreTrust: number };
  kabantugan: KabantuganRules;
  limits: LimitRules;
  /** Expedition records kept for replays (expeditions.ts), envoys sent on a trade, and the most sprites a replay draws. */
  expeditions: { keep: number; envoys: number; maxSprites: number };
  villages: { bands: VillageBand[] };
  mourning: { seconds: number; maxSeconds: number; happiness: number };
  /** Rice the barangay holds with no Kamalig. */
  storage: { baseRice: number; baseDried: number; baseSalt: number };
  /** How a barangay eats and stores food (food.ts). */
  food: FoodRules;
  /** Blood debts, feuds and making peace (W.2, W.3, feud.ts). */
  feud: import("./feud").FeudRules;
  /** Warriors and honor (W.4, honor.ts). */
  honor: import("./honor").HonorRules;
  /** A lively barangay (W.6, social.ts). */
  social: import("./social").SocialRules;
  /** Moving a Bahay Kubo together (W.7): helpers needed, seconds they're busy, the happiness it brings. */
  bayanihan: { helpers: number; seconds: number; happiness: number; happinessSeconds: number };
  /** Rats, locusts and wild boar (food.ts updatePests). */
  pests: PestRules;
  /** Shares of women, children and elders among new residents (residents.ts). */
  residents: { womanPercent: number; childPercent: number; elderPercent: number; classPercent: Record<SocialClass, number> };
  population: PopulationRules;
  /** How many sick villagers a healer's hut holds (healing.ts). */
  healing: { hutCapacity: number };
  /** The Bahay ng Datu's footprint and the gathering spots around it (plaza.ts). */
  plaza: { bigFromLevel: number; reserveFromLevel: number; bigWidth: number; bigHeight: number; spotsPerTile: number; gatherMax: number; clearingMin: number; clearingMax: number };
  /** The wood and gold soft cap (stockpile.ts): multiple × the next big purchase, at least minimum; above it production is slowPercent lower, and above stopMultiple × the cap none comes in. */
  stockpile: { multiple: number; minimum: Partial<Record<Resource, number>>; slowPercent: number; stopMultiple: number };
  /** AI barangays: how many forest tiles they queue at a time when they run out of room. */
  aiGrowth: { clearTiles: number };
  happiness: HappinessRules;
}

/** Happiness (0–100): see the _comment in rules.json. */
export interface HappinessRules {
  start: number;
  maxEffectPercent: number;
  pointsPerSecond: number;
  plazaRadius: number;
  perHouseNearPlaza: number;
  maxFromHouses: number;
  hungry: number;
  perSick: number;
  maxFromSick: number;
}

/** What raising the Bahay ng Datu to a level unlocks. */
export const DATU_UNLOCKS = ["envoys", "balangay", "alliances"] as const;
export type DatuUnlock = (typeof DATU_UNLOCKS)[number];

export interface DatuHouseDef {
  /** All production +percent for each level above 1. */
  productionPercentPerLevel: number;
  /** Influence gained with neighbors +percent for each level above 1. */
  influencePercentPerLevel: number;
  /** Level 1 first (it stands from the start); each later level has the cost of raising it. */
  levels: { level: number; cost?: ResourceAmounts; unlocks?: DatuUnlock; minBarangayLevel?: number }[];
}

/** Kabantugan (renown): what each achievement gives, and the renown each barangay level needs. */
export interface KabantuganRules {
  perTenVillagers: number;
  /** The most a task gives; the first ones give less (taskRamp). */
  perTask: number;
  /** Renown for the first task, and how much more each later one gives (up to perTask). */
  taskRamp: { first: number; step: number };
  perRaidWon: number;
  perDefenseWon: number;
  perTrade: number;
  perTributary: number;
  perAlly: number;
  perDatuLevel: number;
  /** The most an Aklat entry gives; the first ones give less (aklatRamp). */
  perAklat: number;
  aklatRamp: { first: number; step: number };
  /** No rank-up or overtaken news before this many seconds of play (the Ranggo still updates). */
  rankNewsAfterSeconds: number;
  aiPerVillager: number;
  aiPerStrength: number;
  /** Renown an AI barangay gets for each battle won, raiding or defending (uncapped). */
  aiPerBattle: number;
  /**
   * The most renown the repeatable sources give per renown day (windowSeconds of game time, time
   * away included), per barangay level: trades, feasts (pista), and fighting (war: raids,
   * defenses, honor, ally calls).
   */
  dailyCaps: { windowSeconds: number; perLevel: { trades: number; pista: number; war: number } };
  /** Renown for levels 2, 3, … (each step larger than the one before). */
  levelAt: number[];
}

/** The reward for reaching a barangay level (content/levels.json). */
/** How a generated AI village looks from a barangay level on (engine/village.ts). */
export interface VillageBand {
  minLevel: number;
  datuLevel: number;
  kamalig: number;
  fishingDocks: number;
  shrine: boolean;
  libingan: boolean;
  balangayDock: boolean;
  roads: boolean;
  housePaths: number;
}

/** Anti-spam limits (engine/limits.ts). */
export interface LimitRules {
  tradeValueFull: number;
  tradeValueMax: number;
  dailyReturns: number[];
  fatigueCounterAt: number;
  fatigueRefuseAt: number;
  fatigueFairness: number;
  marriageMinDays: number;
  sandugoMinDays: number;
}

export interface LevelDef {
  level: number;
  reward: { resources?: ResourceAmounts; title?: Text };
}

export interface PoliticsRules {
  startsAfterSeconds: number;
  minGapSeconds: number;
  chancePerSecond: number;
  warTickSeconds: number;
  warLossPercent: number;
  joinTrust: number;
  maxGrudge: number;
  leaveTrustLoss: number;
  expelTrustLoss: number;
  solidarityPercent: number;
}

/** A scripted political event (content/events/politics): what kind of change it makes, and its news. */
export const POLITICS_TYPES = ["leave", "war", "peace", "join"] as const;
export interface PoliticsEventDef {
  id: string;
  type: (typeof POLITICS_TYPES)[number];
  /** May use {datu}, {barangay}, {bloc} and {other}. */
  text: Text;
  weight: number;
}

export interface DeathRules {
  oldAge: { frailAfterSeconds: number; chancePerSecond: number };
  sickness: { warnAfterSeconds: number; afterSeconds: number; chancePerSecond: number };
  hunger: { afterSeconds: number; everySeconds: number };
}

export interface WorshipRules {
  offeringValues: ResourceAmounts;
  favorPerValue: number;
  maxFavor: number;
  changeTraditionCost: ResourceAmounts;
  neglectAfterSeconds: number;
  neglectPerMinute: number;
  neglectMax: number;
  permission: { tiles: number; favorCost: number; balanceFactor: number };
}

export interface ForestRules {
  start: number;
  perTile: number;
  perTileNearBalete: number;
  baleteRadius: number;
  baleteFelled: number;
  quietSeconds: number;
  recoveryPerMinute: number;
  recoveryPerForestShare: number;
  recoveryPerBalete: number;
  stage1Below: number;
  stage2Below: number;
  prankChancePerSecond: number;
  prankSeconds: number;
  riceWithheldPercent: number;
  sicknessPercent: number;
  replant: { cost: ResourceAmounts; seconds: number; balance: number };
}

/** Cultural fields every being, ritual and lore entry carries (see docs/cultural-review.md). */
export interface Heritage {
  tradition: string;
  sources: string[];
  /** False until a historian or educator has checked it. */
  reviewed: boolean;
}

/** A tradition the barangay follows (content/traditions): its beings, ritual names, burial style and forest spirit. */
export interface TraditionDef extends Heritage {
  id: string;
  /** Position in the chooser (lower first). */
  order?: number;
  name: Text;
  description: Text;
  /** Aklat entries (lore ids) belonging to this tradition. */
  beings: string[];
  rituals: { offering: Text; permission: Text; healer: Text };
  burial: Text;
  /** How its Libingan looks: a burial cave with jars, or longon coffins. */
  burialLook: "jars" | "longon";
  /** How its Bahay ng Datu looks (presentation only): a large raised lowland house, or torogan-inspired. */
  houseStyle?: "lowland" | "torogan";
  /** This tradition's names for the social classes (residents.ts); missing: general terms (ui.json classes). */
  classes?: Record<SocialClass, { name: Text; about: Text }>;
  /** How villagers dress on the map: "malong" (the tube cloth, for women and men alike), or the default baro and tapis / bahag and kanggan (content/lore/precolonial-dress.json). */
  dress?: "malong";
  forestSpirit: { name: Text; stage1: Text; stage2: Text; sources: string[] };
  /** How much more often the Sarimanok visits (1 = the base rate). */
  sarimanokChance: number;
  /** Food by tradition: percent of a building's yield (river-basin rice, upland roots and sago), and whether pigs are kept (food.ts). */
  foodYield?: Record<string, number>;
  pigs?: boolean;
  /**
   * A sourced honorific a woman ruler may be called instead of "Datu" in this tradition (e.g.
   * Dayang for the Tagalog), with its sources, waiting for review (docs/cultural-review.md).
   * Missing where no honorific is sourced: the title stays "Datu".
   */
  womanHonorific?: { term: string; sources: string[]; reviewed: boolean };
  /**
   * How honored warriors are marked (honor.ts): "batok" (tattoos, Visayan) or "ornament" (dress
   * and ornaments), with its sources, waiting for review (docs/cultural-review.md).
   */
  honorMark?: { kind: "batok" | "ornament"; sources: string[]; reviewed: boolean };
}

/** A ritual at the Dambana, paid for with Favor. */
export interface RitualDef extends Heritage {
  id: string;
  type: "ritual";
  name: Text;
  description: Text;
  favorCost: number;
  cooldownSeconds: number;
  /** All production +percent while active. */
  durationSeconds?: number;
  productionPercent?: number;
  /** Rice: this many minutes of the fields' current output, at once. */
  riceMinutes?: number;
  /** Forest Balance restored. */
  forestRestore: number;
  /** Mourning: this share of what's left of it passes at once. */
  mourningShortenPercent?: number;
  lore?: string;
}

/** The Sarimanok: a visitor crossing the map. */
export interface VisitorDef extends Heritage {
  id: string;
  type: "visitor";
  name: Text;
  description: Text;
  chancePerSecond: number;
  minVillagers: number;
  visibleSeconds: number;
  cooldownSeconds: number;
  /** A gift of one resource, an amount from [min, max]. */
  rewards: Partial<Record<Resource, [number, number]>>;
  lore?: string;
}

/** The Bakunawa eclipse: at night, tap the gongs. */
export interface EclipseDef extends Heritage {
  id: string;
  type: "eclipse";
  name: Text;
  description: Text;
  minVillagers: number;
  chancePerSecond: number;
  cooldownSeconds: number;
  durationSeconds: number;
  gongsNeeded: number;
  success: { favor: number; gold: number };
  failure: { ricePercent: number };
  lore?: string;
}

export interface Riddle {
  id: string;
  question: Text;
  options: Text[];
  answer: number;
}

/** Tikbalang trickery: workers lost until a riddle is answered. */
export interface TrickeryDef extends Heritage {
  id: string;
  type: "trickery";
  name: Text;
  description: Text;
  minVillagers: number;
  chancePerSecond: number;
  lowForestMultiplier: number;
  cooldownSeconds: number;
  lostSeconds: number;
  workersLost: number;
  riddles: Riddle[];
  lore?: string;
}

/** When an Aklat entry unlocks, checked by the engine from GameState. */
export type AklatUnlock =
  | { type: "built"; building: string }
  | { type: "near"; tile: "balete"; radius: number }
  | { type: "grove" }
  | { type: "path"; path: string }
  | { type: "flag"; flag: string }
  | { type: "tradition"; tradition: string }
  | { type: "report"; kind: string }
  | { type: "burial"; look: "jars" | "longon" }
  | { type: "any"; of: AklatUnlock[] };

export interface AklatDef {
  order: number;
  /** Illustration placeholder. */
  icon: string;
  name: Text;
  lore: Text;
  inGame: Text;
  hint: Text;
  unlock: AklatUnlock;
}

/** A lore note that is an entry in the Aklat ng Alamat. */
export interface AklatEntry {
  id: string;
  aklat: AklatDef;
  tradition: string;
  sources: string[];
  reviewed: boolean;
}

/** Text in every language the game has. */
export interface Text {
  en: string;
  fil: string;
}

/** What a task (gawain) asks for, checked from GameState. */
export type QuestCondition =
  /** Built this many of `building` (or, together, of the buildings in `also`: e.g. a Gabihan or a Kaingin). */
  | { type: "built"; building: string; count: number; also?: string[] }
  /** Foraged for food by hand this many times (W.8). */
  | { type: "foraged"; count: number }
  | { type: "villagers"; count: number }
  | { type: "tilesCleared"; count: number }
  | { type: "connected"; count: number }
  | { type: "survivedSeason"; season: string }
  | { type: "traded" }
  | { type: "warriors"; count: number }
  | { type: "raidsDefended"; count: number }
  | { type: "tributaries"; count: number }
  | { type: "aklat"; count: number }
  | { type: "replanted"; count: number }
  | { type: "permittedClears"; count: number }
  | { type: "datuLevel"; count: number }
  | { type: "voyages"; count: number }
  | { type: "leadBloc" }
  | { type: "blocMembers"; count: number }
  | { type: "paramount" }
  /** Landing points on the barangay's shore within a standing Kuta's radius (defense.ts). */
  | { type: "shoreWatched"; count: number }
  /** A standing Kuta whose shelter reaches the Bahay ng Datu. */
  | { type: "kutaNearDatu"; count: number }
  /** Kaingin rested, feasts held (food.ts). */
  | { type: "rested"; count: number }
  | { type: "pistas"; count: number }
  /** Trade offers from a neighbor's boat accepted; trades the player proposed themselves (and a neighbor took). */
  | { type: "offersAccepted"; count: number }
  | { type: "tradesProposed"; count: number };

export const QUEST_CONDITIONS = ["built", "villagers", "tilesCleared", "connected", "survivedSeason", "traded", "warriors", "raidsDefended", "tributaries", "aklat", "replanted", "permittedClears", "datuLevel", "voyages", "leadBloc", "blocMembers", "paramount", "shoreWatched", "kutaNearDatu", "rested", "pistas", "foraged", "offersAccepted", "tradesProposed"] as const;

/** One of the Mga Gawain: a task in a chain, with a reward (resources and/or a title for the datu). */
export interface QuestDef {
  id: string;
  /** The task the chain starts with (exactly one). */
  first?: boolean;
  text: Text;
  condition: QuestCondition;
  reward: { resources?: ResourceAmounts; title?: Text };
  /** The task after this one, or null at the end of the chain. */
  next: string | null;
}

/** A one-line story a named villager can get. `{name}` is replaced with their name. */
export interface VillagerStory {
  id: string;
  /** What they do. "warrior" stories go only to a new Mandirigma; others need a workplace of that kind. */
  role: VillagerRole;
  text: Text;
  /** Only for the first villager ever named. */
  first?: boolean;
}

/** Social classes, kept generic in code; each tradition names them (TraditionDef.classes). */
export const SOCIAL_CLASSES = ["nobility", "warrior", "commoner", "dependent"] as const;
export type SocialClass = (typeof SOCIAL_CLASSES)[number];

export const VILLAGER_ROLES = ["villager", "farmer", "woodcutter", "fisher", "warrior"] as const;
export type VillagerRole = (typeof VILLAGER_ROLES)[number];

/** Named villagers: content/villagers.json (chance and stories) and the names in content/names.json. */
/** Births, newcomers and growing up (engine/population.ts; rules.population). */
export interface PopulationRules {
  secondsPerNewcomer: number;
  secondsPerBirth: number;
  birthMinHappiness: number;
  childDays: number;
  elderAfterDays: number;
  childRicePercent: number;
  elderWorkPercent: number;
  newcomerChildPercent: number;
  newcomerElderPercent: number;
  familyMax: number;
  balitaMax: number;
  /** Elders teaching by the evening fire (talambuhay.ts teach). */
  learning: { chancePerEvening: number; maxPerChild: number };
}

/** When a newcomer's reason can come up (content/villagers/arrivals.json). */
export const ARRIVAL_NEEDS = ["alliance", "marriage", "trade", "allyRaided"] as const;
export type ArrivalNeed = (typeof ARRIVAL_NEEDS)[number];

/** Why newcomers came, and the Balita line for it. */
export interface ArrivalReason {
  id: string;
  weight: number;
  needs?: ArrivalNeed;
  boost?: number;
  /** They marry a single villager on arrival. */
  spouse?: boolean;
  /** How many come together: [fewest, most]. */
  size: [number, number];
  text: Text;
}

/** Life-story templates (content/villagers/talambuhay.json; engine/talambuhay.ts, ui/talambuhay.ts). */
export interface TalambuhaySkill {
  id: string;
  /** Only villagers in these roles get it (none: anyone). */
  roles?: VillagerRole[];
  text: Text;
}
export const DETAIL_KINDS = ["habit", "fear", "dream", "place"] as const;
export interface TalambuhayDetail {
  id: string;
  kind: (typeof DETAIL_KINDS)[number];
  text: Text;
}
export interface TalambuhayContent {
  skills: TalambuhaySkill[];
  details: TalambuhayDetail[];
  /** Family sentences: born, bornNoParents, arrived, arrivedNoPlace, founder, spouse, child, children, and. */
  family: Record<string, Text>;
  /** Timeline lines by event (born, arrived, married, ...), and "day". */
  events: Record<string, Text>;
  /** How someone died (the "died" line). */
  causes: Record<string, Text>;
  /** What elders teach children by the fire. */
  lessons: { id: string; text: Text }[];
}

/** Births and arrivals (content/villagers/arrivals.json). */
export interface ArrivalContent {
  birth: Text;
  reasons: ArrivalReason[];
}

export interface VillagerContent {
  /** Chance that an arriving villager gets a name (0.2 = about 1 in 5). */
  chance: number;
  /** Every name (women's and men's). */
  names: string[];
  /** Names for named villagers by gender (content/names.json "villagers"). */
  women: string[];
  men: string[];
  /** Default datu names that are women's names (household.ts). */
  datuWomen: string[];
  stories: VillagerStory[];
  /** Building that makes each role's work possible (no building: anyone). */
  roleBuildings: Partial<Record<VillagerRole, string>>;
}

/** Daan: footpaths laid tile by tile on cleared land. */
export interface RoadRules {
  /** Cost of one tile. Removing a path is free. */
  cost: ResourceAmounts;
  /** Extra output for a building joined to the barangay's center by an unbroken Daan. */
  connectedBonusPercent: number;
  /** How fast villagers walk on Daan (visual only), in percent of normal. */
  walkSpeedPercent: number;
}

/** Progress while the game is closed (see engine/offline.ts). */
export interface OfflineRules {
  /** At most this much time away is credited (8 hours). */
  maxSeconds: number;
  /** Shorter absences are not credited. */
  minSeconds: number;
  /** Simulated in steps of about this size... */
  stepSeconds: number;
  /** ...but never more than this many steps, so a long absence stays quick to compute. */
  maxSteps: number;
  /** Each neighbor makes one AI decision this often offline (less often than online, to stay fast). */
  aiDecisionSeconds: number;
}

/** How often choice events come up. */
export interface ChoiceRules {
  /** None before this game time. */
  startsAfterSeconds: number;
  /** At least this long between two choice events (counted from when one appears). */
  minGapSeconds: number;
  /** Chance one starts, rolled once per game second when allowed. */
  chancePerSecond: number;
}

/** What a choice does. Every field is optional; numbers may be negative. */
export interface ChoiceEffects {
  resources?: ResourceAmountsSigned;
  /** Newcomers (only as many as there is room for) or villagers who leave. */
  villagers?: number;
  /** Villagers who fall sick (positive) or are cured (negative). */
  sick?: number;
  /** With the event's neighbor. */
  trust?: number;
  influence?: number;
  /** Stand with the ally in its war: its enemies hold a grudge against the player. */
  joinWar?: boolean;
  /** Send this percent of the warriors at home to defend the ally against {enemy} (a battle). */
  defendAlly?: number;
  /** Answer an ally's call for help (rules.allyCalls: warriors sent, trust and renown), or let it go unanswered (trust lost). */
  answerAllyCall?: boolean;
  ignoreAllyCall?: boolean;
}

export type ResourceAmountsSigned = Partial<Record<Resource, number>>;

export interface ChoiceOption {
  id: string;
  label: string;
  /** What happens, shown after choosing. */
  result: string;
  effects: ChoiceEffects;
}

/** When a choice event may come up. All listed conditions must hold. */
export interface ChoiceConditions {
  /** Season id(s) from content/events/seasons.json. */
  season?: string[];
  /** A standing building of this type. */
  hasBuilding?: string;
  /** No building of this type. */
  lacksBuilding?: string;
  /** At least one sandugo ally (the event's neighbor is then an ally). */
  allied?: boolean;
  minVillagers?: number;
  /** An ally (sandugo, or in the player's bloc) whose bloc is at war: the event's neighbor; {enemy} is a member of the other side. */
  allyAtWar?: boolean;
  /** The call for help when an ally is raided: never drawn at random, it comes with the raid (region.ts). */
  allyCall?: boolean;
}

/** A short story with 2–3 choices (content/events/choices). */
export interface ChoiceEventDef {
  id: string;
  title: string;
  icon: string;
  /** May use {neighbor} and {datu}. */
  story: string;
  /** The event involves a neighbor: any, an ally, or an independent one. */
  neighbor?: "any" | "ally" | "independent";
  conditions: ChoiceConditions;
  /** Relative chance against other eligible events (default 1). */
  weight: number;
  choices: ChoiceOption[];
  sources: string[];
}

/** Changing your mind about a building: undo, move or demolish it. */
export interface PlacementRules {
  /** How long after building the "Undo" button stays; undo returns the full cost. */
  undoSeconds: number;
  /** Moving costs this percent of the building's current price (rounded up). */
  moveCostPercent: number;
  /** Demolishing returns this percent of what the last copy cost (rounded down). */
  demolishRefundPercent: number;
}

export interface MilitaryRules {
  /** How battles end (W.1, warfare.ts): morale, wounded, the few who die, captives and ransom, fleeing. */
  battle: import("./warfare").BattleRules;
  /** A Mandirigma: trained from a villager, who then guards and fights instead of working. */
  warrior: { cost: ResourceAmounts; attack: number; defense: number };
  /** Defense every barangay has before warriors and walls. */
  baseDefense: number;
  /** Share of the warriors sent (or defending) lost by each side. */
  winnerLossPercent: number;
  loserLossPercent: number;
  /** Share of the loser's rice and wood a winning raid carries off as tribute. */
  lootPercent: number;
  /** How fast warriors walk to a landing (tiles per second on cleared land; forest is slower). */
  warriorTilesPerSecond: number;
  /** Each Kuta (standing or damaged) allows this many trained Mandirigma. */
  warriorsPerKuta: number;
  /** Never more Mandirigma than this percent of the villagers, whatever the Kutas allow. */
  maxWarriorPercent: number;
}

/** Who works where when it matters. */
export interface StaffingRules {
  /** While rice would last less than this, food workplaces (Palayan) are filled first. */
  foodFirstBelowRiceSeconds: number;
  /** The adviser warns once if rice is falling and fewer than this percent of villagers grow food. */
  foodWorkersWarnPercent: number;
}

export interface TraitDef {
  label: string;
  trustGainPercent: number;
  influenceGainPercent: number;
  /** Extra goods received when trading with them. */
  tradeBonusPercent: number;
  offerChanceMultiplier: number;
  /** Raids the player after the truce. */
  raids: boolean;
  /** Share of their villagers they keep as warriors. */
  warriorPercent: number;
  /** How readily they take a trade: traders above 0, proud ones below. */
  tradeWillingness: number;
}

export interface DiplomacyRules {
  truceSeconds: number;
  startInfluence: number;
  trade: { give: number; receivePercent: number; influence: number; trust: number; loyalty: number };
  marriage: { trustNeeded: number; cost: ResourceAmounts; influence: number; trust: number };
  sandugo: { cost: ResourceAmounts; trust: number; allyDefensePercent: number };
  raid: { influence: number; renown: number; trustLossAll: number; trustLossTarget: number; cooldownSeconds: number };
  tribute: { percent: number; everySeconds: number };
  loyalty: {
    start: number;
    decayPerMinute: number;
    rebelBelow: number;
    rebelInfluence: number;
    guardSeconds: number;
    guardPerMinute: number;
  };
  aiRaid: {
    chancePerSecond: number;
    cooldownSeconds: number;
    lootPercent: number;
    defendRenown: number;
    /** Raiders land at one of this many river-bank spots nearest the barangay. */
    landingChoices: number;
    /** How much likelier an unwatched landing is than a watched one, and a cove or river mouth than a plain bank. */
    unwatchedWeight: number;
    coveWeight: number;
    /** Winning raiders take this percent of the loot when allied defenders are on their way. */
    alliesComingLootPercent: number;
    /** When raids come: at night and dawn more, by day less; more around season changes, fewer in a typhoon. */
    timing: { nightDawnFactor: number; dayFactor: number; dawnShare: number; seasonChangeSeconds: number; seasonChangeFactor: number; typhoonFactor: number };
    /** Where winning raiders go for loot (visual): the first of these building types the barangay has. Unknown ids are skipped. */
    lootTargets: string[];
  };
  /** Neighbors' trade offers; none before startsAfterSeconds of game time (a new datu has enough to learn). */
  offers: OfferRules;
  aiDecisionSeconds: number;
  traits: Record<string, TraitDef>;
  /** Resentment of the player's raids (0..100). */
  grudge: { raidLost: number; raidWon: number; decayPerMinute: number; embargoAt: number; noAlliancesAbove: number; raidsReasonAbove: number };
  /** How a neighbor weighs a proposed trade (see trading.ts). */
  tradeDecision: {
    values: Partial<Record<string, number>>;
    grudgeWeight: number;
    trustWeight: number;
    closeBand: number;
    counterBand: number;
    minAmount: number;
    maxAmount: number;
    counterSeconds: number;
  };
  /** Peace gifts: value per resource (unknown resources, like gold before it exists, are skipped). */
  handog: { values: Partial<Record<string, number>>; grudgePerValue: number; trustPerValue: number; minValue: number };
  /** What a datu says when refusing, by reason. May use {datu} and {resource}. */
  refusals: Record<RefusalReason, string>;
}

export const REFUSAL_REASONS = ["embargo", "raids", "unfair", "short", "alliance", "tired"] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

/** An AI neighbor barangay along the regional river. */
export interface NeighborDef {
  id: string;
  name: string;
  datu: string;
  trait: string;
  description: string;
  /** On the player's home island (the old river neighbors). Others are placed on other islands from the seed. */
  home?: boolean;
  /** Where it sits on the home island's river: 0 = upstream, 1 = downstream, and which bank (home neighbors only). */
  river?: { position: number; bank: "left" | "right" };
  /** Its tradition (content/traditions); picked from the seed when not given. */
  tradition?: string;
  start: { villagers: number; warriors: number; resources: ResourceAmounts; buildings: Record<string, number> };
  /** Starting trust towards the player, 0..100. */
  trust: number;
  fictional?: boolean;
  note?: string;
}

/** Where a barangay trades from: the coast, or upriver and inland. */
export type TradeKind = "coastal" | "upriver";
export const TRADE_KINDS: TradeKind[] = ["coastal", "upriver"];

/** AI barangays' trade offers (engine/tradeOffers.ts); see the rules.json comment. */
export interface OfferRules {
  chancePerSecond: number;
  expireSeconds: number;
  receivePercent: number;
  startsAfterSeconds: number;
  /** What an offer is worth, in gold. */
  worthGold: number;
  /** Home-island barangays this far down the river (0 upstream, 1 the mouth) or further are coastal. */
  coastFrom: number;
  /** On other islands, barangays within this share of the island's radius from its middle are inland. */
  inlandWithin: number;
  /** Traditions whose barangays are always inland (upland). */
  uplandTraditions: string[];
  /** Stock a barangay keeps per villager; only what's above it is offered. */
  keepPerVillager: Record<Resource, number>;
  /** Below this much Pagkain and Palay per villager, a barangay asks for food. */
  needFoodPerVillager: number;
  /** They offer Palay only above this much per villager. */
  palaySurplusPerVillager: number;
  /** They ask this percent of Palay's value when they give it. */
  palayPremiumPercent: number;
  /** A typhoon on the player costs AI barangays on the same island this share of their Pagkain. */
  typhoonFoodLossPercent: number;
  /** How long after that storm their fields count as flooded. */
  floodedForSeconds: number;
  /** What coastal and upriver barangays make on their own (Asin, panned gold), per villager per minute. */
  incomePerVillagerPerMinute: Record<TradeKind, ResourceAmounts>;
  /** What each kind offers (from its surplus) and asks for, in order of preference. */
  kinds: Record<TradeKind, { give: Resource[]; want: Resource[] }>;
  /** How a resource shows in an offer from each kind (ui.json trade.goods ids): Pagkain as dried fish or root crops, wood as hardwood. */
  goods: Record<TradeKind, Partial<Record<Resource, string[]>>>;
  /**
   * Learning to trade: the first `firstOffers` offers of a game ask only for what the player has
   * plenty of (at most maxSharePercent of their stock) and wait expireSeconds; for earlySeconds
   * from the founding, offers never ask for goods the player can't produce yet.
   */
  learning: { firstOffers: number; maxSharePercent: number; expireSeconds: number; earlySeconds: number };
  /**
   * Salt by trade: coastal barangays offer to a barangay with no Asinan noCoastMultiplier times
   * as often, and saltPromptMultiplier times as often (until the first such offer) once it has a
   * fishing building or fresh Pagkain spoiling (at least spoilingFresh); with its own Asinan,
   * ownAsinanMultiplier times as often, and they no longer favor Asin.
   */
  salt: { noCoastMultiplier: number; saltPromptMultiplier: number; spoilingFresh: number; ownAsinanMultiplier: number };
}

/** A lore note: short text with at least one source. */
export interface LoreNote {
  id: string;
  name: string;
  description: string;
  tradition?: string;
  sources: string[];
  [extra: string]: unknown;
}

/** The generated map: forest with a winding river, a few balete trees and a cleared start. */
export interface MapRules {
  width: number;
  height: number;
  /** The start area is a square of (2r + 1) tiles around the plaza. */
  startClearRadius: number;
  riverWidth: number;
  baleteTrees: number;
  /** Balete trees grow at least this many tiles from the plaza. */
  baleteMinDistance: number;
  /** Rows of sea along the bottom edge (the coast). */
  seaDepth?: number;
}

/** Clearing a forest tile: villagers work for a while and bring back some wood. */
export interface ClearingRules {
  baseSeconds: number;
  /** How time and cost rise with each tile cleared or queued: × (1 + linear·n + quadratic·n²) (curve.ts). */
  growth: Curve;
  /** Rice (or other goods) paid upfront for the first tile; later tiles cost more, like the time. */
  cost: ResourceAmounts;
  /** Free villagers each clearing job needs (villagers not working in a building). */
  workers: number;
  wood: number;
  /**
   * When every villager is busy, clearing borrows from workplaces: the building types in
   * `order` first, then whichever has the most workers. Types in `protect` are skipped while
   * rice would last less than protectBelowRiceSeconds.
   */
  borrow: { order: string[]; protect: string[]; protectBelowRiceSeconds: number };
}

/** Gutom: at 0 rice villagers stop working; after a grace period, families leave. */
export interface HungerEvent {
  id: string;
  type: "hunger";
  name: string;
  icon: string;
  description: string;
  graceSeconds: number;
  secondsPerVillagerLeaving: number;
}

export interface Season {
  id: string;
  name: string;
  icon: string;
  description: string;
  durationSeconds: number;
  /** Output of each resource, in percent of normal (missing = 100). */
  productionPercent: ResourceAmounts;
}

/** The year cycles through these seasons in order. */
export interface SeasonsEvent {
  id: string;
  type: "seasons";
  name: string;
  description: string;
  seasons: Season[];
}

/** A random disaster. It can't start before startsAfterSeconds or within cooldownSeconds of the last one. */
interface DisasterBase {
  id: string;
  name: string;
  icon: string;
  description: string;
  startsAfterSeconds: number;
  /** Chance it starts, rolled once per game second. */
  chancePerSecond: number;
  cooldownSeconds: number;
}

/** Sakit: villagers fall sick and can't work for a while. Spreads faster in crowded housing. */
export interface SicknessEvent extends DisasterBase {
  type: "sickness";
  sickSeconds: number;
  firstCases: number;
  /** Chance per second, per sick villager, that one more falls sick. */
  spreadChancePerSecond: number;
  /** Each pair of these buildings sharing an edge raises the spread chance by this percent. */
  /** Crowded houses spread it faster: percentPerAdjacentPair for each pair, up to maxPercent in all. */
  crowding: { building: string; percentPerAdjacentPair: number; maxPercent?: number };
}

/** Sunog: a building catches fire, spreads to neighbours of the same type, and burns down (damaged). */
export interface FireEvent extends DisasterBase {
  type: "fire";
  target: string;
  spreadAfterSeconds: number;
  burnDownSeconds: number;
}

/** Bagyo: a warning, then a few buildings are damaged. */
export interface TyphoonEvent extends DisasterBase {
  type: "typhoon";
  warningSeconds: number;
  damagedBuildings: { min: number; max: number };
}

export type EventDef = HungerEvent | SeasonsEvent | SicknessEvent | FireEvent | TyphoonEvent;

/** At most one event of each type. A missing file simply switches that event off. */
export interface Events {
  hunger?: HungerEvent;
  seasons?: SeasonsEvent;
  sickness?: SicknessEvent;
  fire?: FireEvent;
  typhoon?: TyphoonEvent;
}

/**
 * A grove: while a tile of this kind stands (a balete), buildings of one type within `radius`
 * tiles (straight-line distance between tile centres) produce `percent` more of a resource.
 * Several groves never stack on the same building: it gets the bonus once.
 */
export interface GroveBlessing {
  id: string;
  type: "grove";
  name: string;
  description: string;
  tile: "balete";
  radius: number;
  affects: string;
  resource: Resource;
  percent: number;
  /** How often the spirit shows itself: chance per balete in each time window (UI only). */
  sighting?: { chancePercent: number; windowSeconds: number };
  tradition: string;
  /** Lore note id (content/lore) shown when the player taps the spirit. */
  lore?: string;
  sources: string[];
}

export interface Content {
  buildings: BuildingDef[];
  rules: Rules;
  events: Events;
  lore: Record<string, LoreNote>;
  groves: GroveBlessing[];
  neighbors: NeighborDef[];
  choices: ChoiceEventDef[];
  /** Mga Gawain, in chain order (first task first). */
  quests: QuestDef[];
  villagers: VillagerContent;
  arrivals: ArrivalContent;
  talambuhay: TalambuhayContent;
  traditions: TraditionDef[];
  rituals: RitualDef[];
  visitor: VisitorDef | null;
  eclipse: EclipseDef | null;
  trickery: TrickeryDef | null;
  /** Aklat ng Alamat entries, in book order. */
  aklat: AklatEntry[];
  /** Island names for the archipelago (content/islands.json), the home island first. */
  islands: string[];
  politics: PoliticsEventDef[];
  /** Barangay level rewards (content/levels.json), by level. */
  levels: LevelDef[];
  /** The Bahay ng Datu (from content/buildings, kept out of `buildings`: it is never placed). */
  datuHouse: (BuildingDef & { datuHouse: DatuHouseDef }) | null;
  /** Set for AI barangays' content: no Forest Balance, Aklat or visitors for them. */
  ai?: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonNegNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function checkAmounts(v: unknown, where: string): ResourceAmounts {
  if (!isObject(v)) throw new Error(`${where} must be an object`);
  for (const [key, amount] of Object.entries(v)) {
    if (!(RESOURCES as readonly string[]).includes(key)) {
      throw new Error(`${where} has unknown resource "${key}"`);
    }
    if (!isNonNegNumber(amount)) throw new Error(`${where}.${key} must be a number >= 0`);
  }
  return v as ResourceAmounts;
}

/** Checks one building file against the schema. Throws a readable error if it's wrong. */
export function validateBuilding(raw: unknown, file = "building"): BuildingDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  for (const key of ["id", "name", "description", "icon"]) {
    if (typeof raw[key] !== "string" || raw[key] === "") {
      throw new Error(`${file}: "${key}" must be a non-empty string`);
    }
  }
  if (!/^[a-z0-9-]+$/.test(raw.id as string)) {
    throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  }
  if (raw.order !== undefined && !Number.isFinite(raw.order)) throw new Error(`${file}: "order" must be a number`);
  if (raw.category !== undefined && (typeof raw.category !== "string" || raw.category === "")) throw new Error(`${file}: "category" must be a non-empty string`);
  if (raw.menuGroup !== undefined && (typeof raw.menuGroup !== "string" || !/^[a-z0-9-]+$/.test(raw.menuGroup))) throw new Error(`${file}: "menuGroup" must be an id (a-z, 0-9, "-")`);
  checkAmounts(raw.cost, `${file}: cost`);
  checkAmounts(raw.repairCost, `${file}: repairCost`);
  if (raw.heals !== undefined && (!isObject(raw.heals) || !isNonNegNumber(raw.heals.percentFaster))) {
    throw new Error(`${file}: "heals.percentFaster" must be a number >= 0`);
  }
  if (raw.produces !== undefined) checkAmounts(raw.produces, `${file}: produces`);
  for (const key of ["workers", "housing"]) {
    if (raw[key] !== undefined && (!Number.isInteger(raw[key]) || (raw[key] as number) < 0)) {
      throw new Error(`${file}: "${key}" must be a whole number >= 0`);
    }
  }
  if (raw.adjacencyBonus !== undefined) {
    const bonus = raw.adjacencyBonus;
    if (
      !isObject(bonus) ||
      !Array.isArray(bonus.nextTo) ||
      bonus.nextTo.length === 0 ||
      !bonus.nextTo.every((t) => typeof t === "string" && t !== "")
    ) {
      throw new Error(`${file}: "adjacencyBonus.nextTo" must list at least one terrain or building id`);
    }
    if (!isNonNegNumber(bonus.percent)) throw new Error(`${file}: "adjacencyBonus.percent" must be a number >= 0`);
  }
  if (raw.defense !== undefined && !isNonNegNumber(raw.defense)) throw new Error(`${file}: "defense" must be a number >= 0`);
  if (raw.watch !== undefined && raw.watch !== true) throw new Error(`${file}: "watch" must be true if given`);
  if (raw.stakes !== undefined && raw.stakes !== true) throw new Error(`${file}: "stakes" must be true if given`);
  if (raw.foodKind !== undefined && !(FOOD_KINDS as readonly unknown[]).includes(raw.foodKind)) throw new Error(`${file}: "foodKind" must be one of ${FOOD_KINDS.join(", ")}`);
  if (raw.foodGroup !== undefined && !(FOOD_GROUPS as readonly unknown[]).includes(raw.foodGroup)) throw new Error(`${file}: "foodGroup" must be one of ${FOOD_GROUPS.join(", ")}`);
  if (isObject(raw.produces) && raw.produces.food !== undefined && (!raw.foodKind || !raw.foodGroup)) throw new Error(`${file}: a building that produces food needs "foodKind" and "foodGroup"`);
  for (const k of ["typhoonProof", "depletes", "wearsOut", "keepsFishAlive"]) if (raw[k] !== undefined && typeof raw[k] !== "boolean") throw new Error(`${file}: "${k}" must be true or false`);
  if (raw.typhoonWeight !== undefined && !isNonNegNumber(raw.typhoonWeight)) throw new Error(`${file}: "typhoonWeight" must be a number >= 0`);
  if (raw.produces !== undefined && !raw.workers) {
    throw new Error(`${file}: a building that produces needs "workers"`);
  }
  if (raw.placeOn !== undefined && raw.placeOn !== "cleared" && raw.placeOn !== "river") {
    throw new Error(`${file}: "placeOn" must be "cleared" or "river"`);
  }
  if (raw.bridge !== undefined && (!isObject(raw.bridge) || !Number.isInteger(raw.bridge.maxSpan) || (raw.bridge.maxSpan as number) < 1)) {
    throw new Error(`${file}: "bridge.maxSpan" must be a whole number >= 1`);
  }
  if (raw.placeOn === "river" && raw.bridge === undefined) throw new Error(`${file}: a building on the river must be a "bridge"`);
  if (raw.placeNextTo !== undefined && (!Array.isArray(raw.placeNextTo) || raw.placeNextTo.length === 0 || !raw.placeNextTo.every((t) => (TERRAINS as readonly unknown[]).includes(t)))) {
    throw new Error(`${file}: "placeNextTo" must list terrains (${TERRAINS.join(", ")})`);
  }
  if (raw.storage !== undefined) checkAmounts(raw.storage, `${file}: storage`);
  if (raw.upgrades !== undefined) {
    if (!Array.isArray(raw.upgrades) || raw.upgrades.length === 0) throw new Error(`${file}: "upgrades" must list levels`);
    raw.upgrades.forEach((u, i) => {
      if (!isObject(u) || u.level !== i + 2) throw new Error(`${file}: upgrades must run level 2, 3… in order`);
      checkAmounts(u.cost, `${file}: upgrade level ${i + 2} cost`);
      if (u.storage !== undefined) checkAmounts(u.storage, `${file}: upgrade level ${i + 2} storage`);
    });
  }
  if (raw.nightWork !== undefined && typeof raw.nightWork !== "boolean") throw new Error(`${file}: "nightWork" must be true or false`);
  if (raw.burial !== undefined && (!isObject(raw.burial) || !isNonNegNumber(raw.burial.mourningPercentFaster))) throw new Error(`${file}: "burial.mourningPercentFaster" must be a number >= 0`);
  if (raw.datuHouse !== undefined) {
    const d = raw.datuHouse;
    if (!isObject(d) || !Array.isArray(d.levels) || d.levels.length === 0) throw new Error(`${file}: "datuHouse.levels" must list the levels`);
    checkNumbers(d, ["productionPercentPerLevel", "influencePercentPerLevel"], `${file}: datuHouse`);
    d.levels.forEach((l, i) => {
      if (!isObject(l) || l.level !== i + 1) throw new Error(`${file}: datuHouse.levels must run 1, 2, 3… in order`);
      if (i > 0) checkAmounts(l.cost, `${file}: datuHouse level ${i + 1} cost`);
      if (l.unlocks !== undefined && !(DATU_UNLOCKS as readonly unknown[]).includes(l.unlocks)) throw new Error(`${file}: unknown unlock "${String(l.unlocks)}"`);
    });
  }
  if (!isObject(raw.unlock)) throw new Error(`${file}: "unlock" must be an object`);
  if (raw.unlock.datuLevel !== undefined && (!Number.isInteger(raw.unlock.datuLevel) || (raw.unlock.datuLevel as number) < 1)) throw new Error(`${file}: "unlock.datuLevel" must be a whole number >= 1`);
  if (raw.balangayDock !== undefined) {
    const b = raw.balangayDock;
    if (!isObject(b) || !Number.isInteger(b.boats) || (b.boats as number) < 1) throw new Error(`${file}: "balangayDock.boats" must be a whole number >= 1`);
    checkAmounts(b.boatCost, `${file}: balangayDock.boatCost`);
  }
  if (raw.unlock.villagers !== undefined && !isNonNegNumber(raw.unlock.villagers)) {
    throw new Error(`${file}: "unlock.villagers" must be a number >= 0`);
  }
  if (
    !Array.isArray(raw.sources) ||
    raw.sources.length === 0 ||
    !raw.sources.every((s) => typeof s === "string" && s !== "")
  ) {
    throw new Error(`${file}: "sources" needs at least one reference`);
  }
  return raw as unknown as BuildingDef;
}

function checkCurve(raw: unknown, where: string) {
  if (!isObject(raw) || !isNonNegNumber(raw.linear) || !isNonNegNumber(raw.quadratic)) throw new Error(`${where} needs "linear" and "quadratic" numbers >= 0`);
}

export function validateRules(raw: unknown): Rules {
  if (!isObject(raw) || !isObject(raw.start)) throw new Error("rules: missing \"start\"");
  checkAmounts(raw.start.resources, "rules: start.resources");
  if (!isNonNegNumber(raw.start.villagers)) throw new Error("rules: start.villagers must be a number");
  if (!isObject(raw.start.buildings)) throw new Error("rules: start.buildings must be an object");
  for (const key of [
    "baseHousing",
    "foodEatenPerVillagerPerSecond",
    "gatherPerClick",
    "secondsPerNewVillager",
  ]) {
    if (!isNonNegNumber(raw[key])) throw new Error(`rules: "${key}" must be a number >= 0`);
  }
  checkCurve(raw.costCurve, "rules: costCurve");
  const map = raw.map;
  if (!isObject(map)) throw new Error('rules: missing "map"');
  for (const key of ["width", "height", "startClearRadius", "riverWidth", "baleteTrees", "baleteMinDistance"]) {
    if (!Number.isInteger(map[key]) || (map[key] as number) < 0) {
      throw new Error(`rules: "map.${key}" must be a whole number >= 0`);
    }
  }
  const r = map.startClearRadius as number;
  if ((map.width as number) < 4 * r + 12 || (map.height as number) < 2 * r + 5) {
    throw new Error("rules: the map is too small for the start area, the river and forest on both banks");
  }
  if (!isNonNegNumber(raw.secondsPerVillagerLeavingOvercrowded) || raw.secondsPerVillagerLeavingOvercrowded <= 0) {
    throw new Error('rules: "secondsPerVillagerLeavingOvercrowded" must be a number > 0');
  }
  const placement = raw.placement;
  if (!isObject(placement)) throw new Error('rules: missing "placement"');
  checkNumbers(placement, ["undoSeconds", "moveCostPercent", "demolishRefundPercent"], "rules: placement");
  if ((placement.demolishRefundPercent as number) > 100) throw new Error("rules: placement.demolishRefundPercent can't be over 100");
  const clearing = raw.clearing;
  if (!isObject(clearing)) throw new Error('rules: missing "clearing"');
  checkNumbers(clearing, ["baseSeconds", "wood"], "rules: clearing", false);
  checkCurve(clearing.growth, "rules: clearing.growth");
  checkNumbers(clearing, ["workers"], "rules: clearing", true);
  checkAmounts(clearing.cost, "rules: clearing.cost");
  const borrow = clearing.borrow;
  if (!isObject(borrow) || !Array.isArray(borrow.order) || !Array.isArray(borrow.protect)) {
    throw new Error('rules: "clearing.borrow" needs "order" and "protect" lists of building ids');
  }
  checkNumbers(borrow, ["protectBelowRiceSeconds"], "rules: clearing.borrow");
  const military = raw.military;
  if (!isObject(military) || !isObject(military.warrior)) throw new Error('rules: missing "military.warrior"');
  checkAmounts(military.warrior.cost, "rules: military.warrior.cost");
  checkNumbers(military.warrior, ["attack", "defense"], "rules: military.warrior");
  checkNumbers(military, ["baseDefense", "winnerLossPercent", "loserLossPercent", "lootPercent"], "rules: military");
  const watch = raw.watch;
  if (!isObject(watch)) throw new Error('rules: missing "watch"');
  checkNumbers(watch, ["radius", "watchedWarningSeconds", "unwatchedWarningSeconds"], "rules: watch", true);
  checkNumbers(watch, ["revealUnwatchedSeconds"], "rules: watch");
  const tb = raw.tambuli;
  if (!isObject(tb)) throw new Error('rules: missing "tambuli"');
  checkNumbers(tb, ["volunteerPercent", "distancePenaltyPerUnit", "smallRaidAttackers", "cooldownSeconds", "overuseTrust"], "rules: tambuli");
  const kuta = raw.kuta;
  if (!isObject(kuta)) throw new Error('rules: missing "kuta"');
  checkNumbers(kuta, ["rallySeconds", "readySeconds", "readyBonus", "shelterRadius", "shelteredLootPercent"], "rules: kuta");
  checkNumbers(military, ["warriorTilesPerSecond"], "rules: military", true);
  checkNumbers(military, ["warriorsPerKuta", "maxWarriorPercent"], "rules: military");
  if (!isObject(raw.staffing)) throw new Error('rules: missing "staffing"');
  checkNumbers(raw.staffing, ["foodFirstBelowRiceSeconds", "foodWorkersWarnPercent"], "rules: staffing");
  const d = raw.diplomacy;
  if (!isObject(d)) throw new Error('rules: missing "diplomacy"');
  checkNumbers(d, ["truceSeconds", "startInfluence"], "rules: diplomacy");
  checkNumbers(d, ["aiDecisionSeconds"], "rules: diplomacy", true);
  const sections: Record<string, string[]> = {
    trade: ["give", "receivePercent", "influence", "trust", "loyalty"],
    marriage: ["trustNeeded", "influence", "trust"],
    sandugo: ["trust", "allyDefensePercent"],
    raid: ["influence", "renown", "trustLossAll", "trustLossTarget", "cooldownSeconds"],
    tribute: ["percent", "everySeconds"],
    loyalty: ["start", "decayPerMinute", "rebelBelow", "rebelInfluence", "guardSeconds", "guardPerMinute"],
    aiRaid: ["chancePerSecond", "cooldownSeconds", "lootPercent", "defendRenown", "landingChoices", "unwatchedWeight", "coveWeight", "alliesComingLootPercent"],
    offers: ["chancePerSecond", "expireSeconds", "receivePercent", "startsAfterSeconds", "worthGold", "coastFrom", "inlandWithin", "needFoodPerVillager", "palaySurplusPerVillager", "palayPremiumPercent", "typhoonFoodLossPercent", "floodedForSeconds"],
  };
  for (const [section, keys] of Object.entries(sections)) {
    if (!isObject(d[section])) throw new Error(`rules: missing "diplomacy.${section}"`);
    checkNumbers(d[section] as Record<string, unknown>, keys, `rules: diplomacy.${section}`);
  }
  validateOffers(d.offers as Record<string, unknown>);
  const timing = (d.aiRaid as Record<string, unknown>).timing;
  if (!isObject(timing)) throw new Error('rules: missing "diplomacy.aiRaid.timing"');
  checkNumbers(timing, ["nightDawnFactor", "dayFactor", "dawnShare", "seasonChangeSeconds", "seasonChangeFactor", "typhoonFactor"], "rules: diplomacy.aiRaid.timing");
  const ch = raw.choices;
  if (!isObject(ch)) throw new Error('rules: missing "choices"');
  checkNumbers(ch, ["startsAfterSeconds", "minGapSeconds", "chancePerSecond"], "rules: choices");
  if ((ch.chancePerSecond as number) > 1) throw new Error("rules: choices.chancePerSecond can't be over 1");
  const roads = raw.roads;
  if (!isObject(roads)) throw new Error('rules: missing "roads"');
  checkAmounts(roads.cost, "rules: roads.cost");
  checkNumbers(roads, ["connectedBonusPercent"], "rules: roads");
  checkNumbers(roads, ["walkSpeedPercent"], "rules: roads", true);
  const off = raw.offline;
  if (!isObject(off)) throw new Error('rules: missing "offline"');
  checkNumbers(off, ["maxSeconds", "minSeconds"], "rules: offline");
  checkNumbers(off, ["stepSeconds", "maxSteps", "aiDecisionSeconds"], "rules: offline", true);
  checkAmounts((d.marriage as Record<string, unknown>).cost, "rules: diplomacy.marriage.cost");
  if (!isObject(d.grudge)) throw new Error('rules: missing "diplomacy.grudge"');
  checkNumbers(d.grudge, ["raidLost", "raidWon", "decayPerMinute", "embargoAt", "noAlliancesAbove", "raidsReasonAbove"], "rules: diplomacy.grudge");
  const td = d.tradeDecision;
  if (!isObject(td) || !isObject(td.values)) throw new Error('rules: missing "diplomacy.tradeDecision.values"');
  checkNumbers(td, ["grudgeWeight", "trustWeight", "closeBand", "counterBand"], "rules: diplomacy.tradeDecision");
  checkNumbers(td, ["minAmount", "maxAmount", "counterSeconds"], "rules: diplomacy.tradeDecision", true);
  for (const r of RESOURCES) if (!isNonNegNumber(td.values[r]) || td.values[r] === 0) throw new Error(`rules: tradeDecision.values.${r} must be > 0`);
  const hg = d.handog;
  if (!isObject(hg) || !isObject(hg.values)) throw new Error('rules: missing "diplomacy.handog.values"');
  checkNumbers(hg, ["grudgePerValue", "trustPerValue", "minValue"], "rules: diplomacy.handog");
  for (const [r, v] of Object.entries(hg.values)) if (!isNonNegNumber(v)) throw new Error(`rules: handog.values.${r} must be a number >= 0`);
  if (!isObject(d.refusals)) throw new Error('rules: missing "diplomacy.refusals"');
  checkStrings(d.refusals, [...REFUSAL_REASONS], "rules: diplomacy.refusals");
  const loot = (d.aiRaid as Record<string, unknown>).lootTargets;
  if (!Array.isArray(loot) || !loot.every((t) => typeof t === "string" && t !== "")) {
    throw new Error('rules: "diplomacy.aiRaid.lootTargets" must be a list of building ids');
  }
  checkAmounts((d.sandugo as Record<string, unknown>).cost, "rules: diplomacy.sandugo.cost");
  if ((d.tribute as Record<string, number>).everySeconds <= 0) throw new Error("rules: diplomacy.tribute.everySeconds must be > 0");
  if (!isObject(d.traits) || Object.keys(d.traits).length === 0) throw new Error('rules: missing "diplomacy.traits"');
  for (const [name, trait] of Object.entries(d.traits)) {
    if (!isObject(trait) || typeof trait.raids !== "boolean") throw new Error(`rules: trait "${name}" needs "raids" true or false`);
    checkStrings(trait, ["label"], `rules: trait ${name}`);
    checkNumbers(
      trait,
      ["trustGainPercent", "influenceGainPercent", "tradeBonusPercent", "offerChanceMultiplier", "warriorPercent"],
      `rules: trait ${name}`,
    );
    if (typeof trait.tradeWillingness !== "number" || !Number.isFinite(trait.tradeWillingness)) throw new Error(`rules: trait ${name} needs "tradeWillingness"`);
  }
  if (!Array.isArray(raw.gatherable) || !raw.gatherable.every((r) => (RESOURCES as readonly unknown[]).includes(r))) {
    throw new Error('rules: "gatherable" must list resources');
  }
  if (!isObject(raw.storage)) throw new Error('rules: missing "storage"');
  checkNumbers(raw.storage, ["baseRice", "baseDried", "baseSalt"], "rules: storage");
  validateFoodRules(raw.food, raw.pests);
  if (!isObject(raw.stockpile) || !isNonNegNumber(raw.stockpile.multiple) || !isNonNegNumber(raw.stockpile.slowPercent) || (raw.stockpile.slowPercent as number) > 100 || typeof raw.stockpile.stopMultiple !== "number" || (raw.stockpile.stopMultiple as number) < 1) throw new Error('rules: "stockpile" needs "multiple", "slowPercent" (0-100) and "stopMultiple" (>= 1)');
  checkAmounts(raw.stockpile.minimum, "rules: stockpile.minimum");
  if (!isObject(raw.residents)) throw new Error('rules: missing "residents"');
  for (const key of ["womanPercent", "childPercent", "elderPercent"]) {
    const v = raw.residents[key];
    if (typeof v !== "number" || v < 0 || v > 100) throw new Error(`rules: "residents.${key}" must be 0-100`);
  }
  if ((raw.residents.childPercent as number) + (raw.residents.elderPercent as number) > 100) throw new Error('rules: "residents" childPercent + elderPercent must be at most 100');
  const cp = raw.residents.classPercent;
  if (!isObject(cp) || !SOCIAL_CLASSES.every((c) => isNonNegNumber(cp[c])) || Math.abs(SOCIAL_CLASSES.reduce((n, c) => n + (cp[c] as number), 0) - 100) > 1e-6) {
    throw new Error(`rules: "residents.classPercent" needs ${SOCIAL_CLASSES.join(", ")}, adding up to 100`);
  }
  if (!isObject(raw.healing) || !Number.isInteger(raw.healing.hutCapacity) || (raw.healing.hutCapacity as number) < 1) throw new Error('rules: "healing.hutCapacity" must be a whole number >= 1');
  if (!isObject(raw.plaza)) throw new Error('rules: missing "plaza"');
  for (const key of ["bigFromLevel", "reserveFromLevel", "bigWidth", "bigHeight", "spotsPerTile", "gatherMax", "clearingMin", "clearingMax"]) {
    if (!Number.isInteger(raw.plaza[key]) || (raw.plaza[key] as number) < 1) throw new Error(`rules: "plaza.${key}" must be a whole number >= 1`);
  }
  if ((raw.plaza.clearingMax as number) < (raw.plaza.clearingMin as number)) throw new Error('rules: "plaza.clearingMax" must be at least "plaza.clearingMin"');
  if (!isObject(raw.aiGrowth) || !Number.isInteger(raw.aiGrowth.clearTiles) || (raw.aiGrowth.clearTiles as number) < 1) throw new Error('rules: "aiGrowth.clearTiles" must be a whole number >= 1');
  if (!isObject(raw.happiness)) throw new Error('rules: missing "happiness"');
  if (!isObject(raw.population)) throw new Error('rules: missing "population"');
  checkNumbers(raw.population, ["birthMinHappiness", "childRicePercent", "elderWorkPercent", "newcomerChildPercent", "newcomerElderPercent"], "rules: population");
  checkNumbers(raw.population, ["secondsPerNewcomer", "secondsPerBirth", "childDays", "elderAfterDays", "familyMax", "balitaMax"], "rules: population", true);
  const learning = raw.population.learning;
  if (!isObject(learning)) throw new Error('rules: missing "population.learning"');
  checkNumbers(learning, ["chancePerEvening", "maxPerChild"], "rules: population.learning");
  if ((learning.chancePerEvening as number) > 1) throw new Error("rules: population.learning.chancePerEvening must be 0-1");
  if ((raw.population.newcomerChildPercent as number) + (raw.population.newcomerElderPercent as number) > 100) throw new Error("rules: population newcomer shares add up to more than 100");
  checkNumbers(raw.happiness, ["start", "maxEffectPercent", "pointsPerSecond", "plazaRadius", "perHouseNearPlaza", "maxFromHouses"], "rules: happiness");
  for (const key of ["hungry", "perSick", "maxFromSick"]) {
    if (typeof raw.happiness[key] !== "number" || !Number.isFinite(raw.happiness[key])) throw new Error(`rules: "happiness.${key}" must be a number`);
  }
  if ((raw.happiness.start as number) > 100) throw new Error('rules: "happiness.start" must be 0–100');
  const ec = raw.eclipse;
  if (!isObject(ec)) throw new Error('rules: missing "eclipse"');
  checkNumbers(ec, ["beatSeconds"], "rules: eclipse", true);
  checkNumbers(ec, ["onBeatWindowSeconds", "onBeat", "offBeat", "holdBeat", "mashGapSeconds", "strengthPerLevel", "autoPerDatuLevel"], "rules: eclipse");
  if ((ec.onBeatWindowSeconds as number) * 2 > (ec.beatSeconds as number)) throw new Error("rules: eclipse.onBeatWindowSeconds must be at most half a beat");
  if (!isObject(ec.autoStrikes)) throw new Error('rules: "eclipse.autoStrikes" must map building types to strikes per level');
  checkNumbers(ec.autoStrikes, Object.keys(ec.autoStrikes), "rules: eclipse.autoStrikes");
  const dn = raw.dayNight;
  if (!isObject(dn)) throw new Error('rules: missing "dayNight"');
  checkNumbers(dn, ["daySeconds", "moonCycleDays"], "rules: dayNight", true);
  checkNumbers(dn, ["nightFrom", "nightTo", "nightProductionFactor", "eveningShare"], "rules: dayNight");
  if ((dn.eveningShare as number) > 1) throw new Error("rules: dayNight.eveningShare must be 0-1");
  if ((dn.nightProductionFactor as number) > 1) throw new Error("rules: dayNight.nightProductionFactor must be at most 1");
  if ((dn.nightFrom as number) >= (dn.nightTo as number) || (dn.nightTo as number) > 1) throw new Error("rules: dayNight needs 0 <= nightFrom < nightTo <= 1");
  const w = raw.worship;
  if (!isObject(w)) throw new Error('rules: missing "worship"');
  checkAmounts(w.offeringValues, "rules: worship.offeringValues");
  checkAmounts(w.changeTraditionCost, "rules: worship.changeTraditionCost");
  checkNumbers(w, ["favorPerValue", "maxFavor", "neglectAfterSeconds", "neglectPerMinute", "neglectMax"], "rules: worship");
  if (!isObject(w.permission)) throw new Error('rules: missing "worship.permission"');
  checkNumbers(w.permission, ["tiles", "favorCost", "balanceFactor"], "rules: worship.permission");
  const f = raw.forest;
  if (!isObject(f)) throw new Error('rules: missing "forest"');
  checkNumbers(
    f,
    ["start", "perTile", "perTileNearBalete", "baleteRadius", "baleteFelled", "quietSeconds", "recoveryPerMinute", "recoveryPerForestShare", "recoveryPerBalete", "stage1Below", "stage2Below", "prankChancePerSecond", "prankSeconds", "riceWithheldPercent", "sicknessPercent"],
    "rules: forest",
  );
  const dt = raw.death;
  if (!isObject(dt) || !isObject(dt.oldAge) || !isObject(dt.sickness) || !isObject(dt.hunger)) throw new Error('rules: "death" needs oldAge, sickness and hunger');
  checkNumbers(dt.oldAge, ["frailAfterSeconds", "chancePerSecond"], "rules: death.oldAge");
  checkNumbers(dt.sickness, ["warnAfterSeconds", "afterSeconds", "chancePerSecond"], "rules: death.sickness");
  checkNumbers(dt.hunger, ["afterSeconds", "everySeconds"], "rules: death.hunger", true);
  const mo = raw.mourning;
  if (!isObject(mo)) throw new Error('rules: missing "mourning"');
  checkNumbers(mo, ["seconds", "maxSeconds"], "rules: mourning");
  if (typeof mo.happiness !== "number" || mo.happiness > 0) throw new Error('rules: "mourning.happiness" must be 0 or below');
  for (const [key, fields] of [
    ["archipelago", ["minIslands", "maxIslands"]],
    ["blocs", ["min", "max", "independents"]],
    ["sea", ["secondsPerUnit", "minSeconds", "raidWarriorsPerBoat"]],
    ["politics", ["startsAfterSeconds", "minGapSeconds", "chancePerSecond", "warTickSeconds", "warLossPercent", "joinTrust", "maxGrudge", "leaveTrustLoss", "expelTrustLoss", "solidarityPercent"]],
    ["allyDefense", ["landSeconds", "landSecondsPerUnit", "balangayMinVillagers", "tributarySendPercent"]],
    ["allyCalls", ["startsAfterSeconds", "chancePerSecond", "cooldownSeconds", "warningSeconds", "sendPercent", "renown", "ignoreTrust"]],
  ] as const) {
    const g = raw[key];
    if (!isObject(g)) throw new Error(`rules: missing "${key}"`);
    checkNumbers(g, [...fields], `rules: ${key}`);
  }
  const k = raw.kabantugan;
  if (!isObject(k)) throw new Error('rules: missing "kabantugan"');
  checkNumbers(k, ["perTenVillagers", "perTask", "perRaidWon", "perDefenseWon", "perTrade", "perTributary", "perAlly", "perDatuLevel", "perAklat", "rankNewsAfterSeconds", "aiPerVillager", "aiPerStrength", "aiPerBattle"], "rules: kabantugan");
  for (const ramp of ["taskRamp", "aklatRamp"]) {
    if (!isObject(k[ramp])) throw new Error(`rules: missing "kabantugan.${ramp}"`);
    checkNumbers(k[ramp], ["first", "step"], `rules: kabantugan.${ramp}`);
  }
  if (!isObject(k.dailyCaps)) throw new Error('rules: missing "kabantugan.dailyCaps"');
  checkNumbers(k.dailyCaps, ["windowSeconds"], "rules: kabantugan.dailyCaps");
  if (!isObject(k.dailyCaps.perLevel)) throw new Error('rules: missing "kabantugan.dailyCaps.perLevel"');
  checkNumbers(k.dailyCaps.perLevel, ["trades", "pista", "war"], "rules: kabantugan.dailyCaps.perLevel");
  if (!((k.dailyCaps.windowSeconds as number) > 0)) throw new Error('rules: "kabantugan.dailyCaps.windowSeconds" must be positive');
  // Each level clearly harder than the last: every step between thresholds larger than the one before.
  const step = (arr: unknown[], i: number) => (arr[i] as number) - (i === 0 ? 0 : (arr[i - 1] as number));
  if (!Array.isArray(k.levelAt) || k.levelAt.length === 0 || !k.levelAt.every((v, i, arr) => isNonNegNumber(v) && (i === 0 ? v > 0 : step(arr, i) > step(arr, i - 1)))) {
    throw new Error('rules: "kabantugan.levelAt" must list rising renown thresholds, each step larger than the last');
  }
  const vb = isObject(raw.villages) ? raw.villages.bands : undefined;
  if (!Array.isArray(vb) || vb.length === 0) throw new Error('rules: "villages.bands" must list village bands');
  vb.forEach((b, i) => {
    if (!isObject(b)) throw new Error(`rules: villages.bands[${i}] must be an object`);
    checkNumbers(b, ["minLevel", "datuLevel", "kamalig", "fishingDocks", "housePaths"], `rules: villages.bands[${i}]`);
    for (const k of ["shrine", "libingan", "balangayDock", "roads"]) if (typeof b[k] !== "boolean") throw new Error(`rules: villages.bands[${i}].${k} must be true or false`);
    if ((b.datuLevel as number) < 1 || (b.datuLevel as number) > 5) throw new Error(`rules: villages.bands[${i}].datuLevel must be 1..5`);
    if (i === 0 ? b.minLevel !== 1 : (b.minLevel as number) <= ((vb[i - 1] as Record<string, number>).minLevel)) throw new Error("rules: villages.bands must start at level 1 and rise");
  });
  const ex = raw.expeditions;
  if (!isObject(ex)) throw new Error('rules: missing "expeditions"');
  checkNumbers(ex, ["keep", "envoys", "maxSprites"], "rules: expeditions", true);
  const l = raw.limits;
  if (!isObject(l)) throw new Error('rules: missing "limits"');
  checkNumbers(l, ["tradeValueFull", "tradeValueMax"], "rules: limits", true);
  checkNumbers(l, ["fatigueCounterAt", "fatigueRefuseAt", "fatigueFairness", "marriageMinDays", "sandugoMinDays"], "rules: limits");
  if (!Array.isArray(l.dailyReturns) || l.dailyReturns.length === 0 || !l.dailyReturns.every((v) => isNonNegNumber(v) && v <= 1)) {
    throw new Error('rules: "limits.dailyReturns" must list factors from 0 to 1');
  }
  if (!isObject(f.replant)) throw new Error('rules: missing "forest.replant"');
  checkAmounts(f.replant.cost, "rules: forest.replant.cost");
  checkNumbers(f.replant, ["seconds", "balance"], "rules: forest.replant", true);
  return raw as unknown as Rules;
}

function checkStrings(raw: Record<string, unknown>, keys: string[], file: string) {
  for (const key of keys) {
    if (typeof raw[key] !== "string" || raw[key] === "") throw new Error(`${file}: "${key}" must be a non-empty string`);
  }
}

function validateFoodRules(food: unknown, pests: unknown) {
  if (!isObject(food)) throw new Error('rules: missing "food"');
  checkNumbers(food, ["riceWastePercent", "datuRicePerLevel", "groundPerPlot", "jarsPerHouse", "livePerBaklad", "spoilPercentPerMinute", "smokePerHousePerSecond", "saltPerHousePerSecond", "saltPreservesPerUnit", "typhoonFreshPercent"], "rules: food");
  for (const [k, keys] of [
    ["variety", ["perGroupHappiness", "monotonySeconds", "monotonySickPercent"]],
    ["kaingin", ["fertileHarvest", "fallowBalance"]],
    ["depletion", ["radius", "perUnit", "recoveryPerMinute", "maxPenaltyPercent"]],
    ["brew", ["ricePerWine"]],
    ["pista", ["happiness", "happinessSeconds", "renown", "trust", "cooldownSeconds"]],
    ["migration", ["foodSharePercent", "graceSeconds"]],
  ] as const) {
    if (!isObject(food[k])) throw new Error(`rules: missing "food.${k}"`);
    checkNumbers(food[k] as Record<string, unknown>, [...keys], `rules: food.${k}`);
  }
  if (typeof (food.variety as Record<string, unknown>).monotonyHappiness !== "number") throw new Error('rules: "food.variety.monotonyHappiness" must be a number');
  checkAmounts((food.pista as Record<string, unknown>).cost, "rules: food.pista.cost");
  checkAmounts(food.datuStorePerLevel, "rules: food.datuStorePerLevel");
  if (!isObject(food.seasonYield)) throw new Error('rules: "food.seasonYield" must be an object');
  for (const [season, byType] of Object.entries(food.seasonYield)) {
    if (!isObject(byType)) throw new Error(`rules: food.seasonYield.${season} must be an object`);
    checkNumbers(byType, Object.keys(byType), `rules: food.seasonYield.${season}`);
  }
  if (!Array.isArray(food.roughSeas) || !food.roughSeas.every((x) => typeof x === "string")) throw new Error('rules: "food.roughSeas" must list season ids');
  if (!isObject(pests)) throw new Error('rules: missing "pests"');
  checkNumbers(pests, ["startsAfterSeconds", "ratsChancePerSecond", "ratsPercent", "locustChancePerSecond", "locustWarningSeconds", "locustSeconds", "locustPercent", "boarChancePerSecond", "boarSeconds", "boarPercent", "boarStock", "boarGuardRadius", "cooldownSeconds"], "rules: pests");
}

function validateOffers(o: Record<string, unknown>) {
  const where = "rules: diplomacy.offers";
  if (!isObject(o.learning)) throw new Error(`${where}: missing "learning"`);
  checkNumbers(o.learning, ["firstOffers", "maxSharePercent", "expireSeconds", "earlySeconds"], `${where}.learning`);
  if (!isObject(o.salt)) throw new Error(`${where}: missing "salt"`);
  checkNumbers(o.salt, ["noCoastMultiplier", "saltPromptMultiplier", "spoilingFresh", "ownAsinanMultiplier"], `${where}.salt`);
  const isRes = (r: unknown) => (RESOURCES as readonly unknown[]).includes(r);
  if (!Array.isArray(o.uplandTraditions) || !o.uplandTraditions.every((t) => typeof t === "string")) throw new Error(`${where}.uplandTraditions must list tradition ids`);
  if (!isObject(o.keepPerVillager)) throw new Error(`${where}: missing "keepPerVillager"`);
  checkNumbers(o.keepPerVillager, [...RESOURCES], `${where}.keepPerVillager`);
  for (const key of ["incomePerVillagerPerMinute", "kinds", "goods"]) {
    const v = o[key];
    if (!isObject(v) || !TRADE_KINDS.every((k) => isObject(v[k]))) throw new Error(`${where}.${key} needs "coastal" and "upriver"`);
  }
  for (const k of TRADE_KINDS) {
    const income = (o.incomePerVillagerPerMinute as Record<string, Record<string, unknown>>)[k];
    for (const [r, n] of Object.entries(income)) if (!isRes(r) || !isNonNegNumber(n)) throw new Error(`${where}.incomePerVillagerPerMinute.${k}.${r} must be a resource and a number`);
    const kind = (o.kinds as Record<string, Record<string, unknown>>)[k];
    for (const side of ["give", "want"]) {
      const list = kind[side];
      if (!Array.isArray(list) || list.length === 0 || !list.every(isRes)) throw new Error(`${where}.kinds.${k}.${side} must list resources`);
    }
    const goods = (o.goods as Record<string, Record<string, unknown>>)[k];
    for (const [r, ids] of Object.entries(goods)) {
      if (!isRes(r) || !Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) throw new Error(`${where}.goods.${k}.${r} must list goods ids`);
    }
  }
}

function checkNumbers(raw: Record<string, unknown>, keys: string[], file: string, positive = false) {
  for (const key of keys) {
    const v = raw[key];
    if (!isNonNegNumber(v) || (positive && v === 0)) {
      throw new Error(`${file}: "${key}" must be a number ${positive ? "> 0" : ">= 0"}`);
    }
  }
}

const DISASTER_NUMBERS = ["startsAfterSeconds", "chancePerSecond", "cooldownSeconds"];

/** Checks one event file against the schema for its type. */
export function validateEvent(raw: unknown, file = "event"): EventDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "type", "name", "description"], file);
  if (raw.sources !== undefined && (!Array.isArray(raw.sources) || !raw.sources.every((x) => typeof x === "string"))) {
    throw new Error(`${file}: "sources" must be a list of references`);
  }
  switch (raw.type) {
    case "hunger":
      checkStrings(raw, ["icon"], file);
      checkNumbers(raw, ["graceSeconds"], file);
      checkNumbers(raw, ["secondsPerVillagerLeaving"], file, true);
      break;
    case "seasons":
      if (!Array.isArray(raw.seasons) || raw.seasons.length === 0) throw new Error(`${file}: "seasons" needs at least one season`);
      raw.seasons.forEach((season, i) => {
        const where = `${file}: seasons[${i}]`;
        if (!isObject(season)) throw new Error(`${where} must be an object`);
        checkStrings(season, ["id", "name", "icon", "description"], where);
        checkNumbers(season, ["durationSeconds"], where, true);
        checkAmounts(season.productionPercent, `${where}.productionPercent`);
      });
      break;
    case "sickness":
      checkStrings(raw, ["icon"], file);
      checkNumbers(raw, [...DISASTER_NUMBERS, "spreadChancePerSecond"], file);
      checkNumbers(raw, ["sickSeconds", "firstCases"], file, true);
      if (!isObject(raw.crowding) || typeof raw.crowding.building !== "string" || !isNonNegNumber(raw.crowding.percentPerAdjacentPair)) {
        throw new Error(`${file}: "crowding" needs a "building" id and "percentPerAdjacentPair"`);
      }
      if (raw.crowding.maxPercent !== undefined && !isNonNegNumber(raw.crowding.maxPercent)) throw new Error(`${file}: "crowding.maxPercent" must be a number >= 0`);
      break;
    case "fire":
      checkStrings(raw, ["icon", "target"], file);
      checkNumbers(raw, DISASTER_NUMBERS, file);
      checkNumbers(raw, ["spreadAfterSeconds", "burnDownSeconds"], file, true);
      break;
    case "typhoon": {
      checkStrings(raw, ["icon"], file);
      checkNumbers(raw, [...DISASTER_NUMBERS, "warningSeconds"], file);
      const d = raw.damagedBuildings;
      if (!isObject(d) || !Number.isInteger(d.min) || !Number.isInteger(d.max) || (d.min as number) < 0 || (d.max as number) < (d.min as number)) {
        throw new Error(`${file}: "damagedBuildings" needs whole numbers with 0 <= min <= max`);
      }
      break;
    }
    default:
      throw new Error(`${file}: unknown event type "${String(raw.type)}"`);
  }
  return raw as unknown as EventDef;
}

/** Validates building, rules and event files and checks they fit together. */
export function validateLore(raw: unknown, file = "lore"): LoreNote {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "name", "description"], file);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0 || !raw.sources.every((x) => typeof x === "string" && x !== "")) {
    throw new Error(`${file}: lore needs at least one source`);
  }
  return raw as LoreNote;
}

export function validateGrove(raw: unknown, file = "blessing"): GroveBlessing {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "name", "description", "affects", "tradition"], file);
  if (raw.type !== "grove") throw new Error(`${file}: unknown blessing type "${String(raw.type)}"`);
  if (raw.tile !== "balete") throw new Error(`${file}: "tile" must be "balete"`);
  if (!(RESOURCES as readonly string[]).includes(raw.resource as string)) throw new Error(`${file}: unknown resource "${String(raw.resource)}"`);
  checkNumbers(raw, ["radius", "percent"], file, true);
  if (raw.sighting !== undefined) {
    const s = raw.sighting;
    if (!isObject(s) || !isNonNegNumber(s.chancePercent) || !isNonNegNumber(s.windowSeconds) || s.windowSeconds === 0) {
      throw new Error(`${file}: "sighting" needs "chancePercent" and "windowSeconds" > 0`);
    }
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) throw new Error(`${file}: a blessing from folklore needs a source`);
  return raw as unknown as GroveBlessing;
}

/** Checks one neighbor file. Trait and building ids are checked in buildContent. */
export function validateNeighbor(raw: unknown, file = "neighbor"): NeighborDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "name", "datu", "trait", "description"], file);
  if (!/^[a-z0-9-]+$/.test(raw.id as string)) throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  if (raw.home !== undefined && typeof raw.home !== "boolean") throw new Error(`${file}: "home" must be true or false`);
  const river = raw.river;
  if ((raw.home === true || river !== undefined) && (!isObject(river) || !isNonNegNumber(river.position) || (river.position as number) > 1 || (river.bank !== "left" && river.bank !== "right"))) {
    throw new Error(`${file}: "river" needs a "position" from 0 to 1 and a "bank" of "left" or "right"`);
  }
  if (raw.tradition !== undefined && typeof raw.tradition !== "string") throw new Error(`${file}: "tradition" must be a tradition id`);
  const start = raw.start;
  if (!isObject(start)) throw new Error(`${file}: missing "start"`);
  checkNumbers(start, ["villagers", "warriors"], `${file}: start`);
  if ((start.warriors as number) > (start.villagers as number)) throw new Error(`${file}: warriors are villagers, so there can't be more warriors than villagers`);
  checkAmounts(start.resources, `${file}: start.resources`);
  if (!isObject(start.buildings)) throw new Error(`${file}: "start.buildings" must be an object`);
  if (!isNonNegNumber(raw.trust) || (raw.trust as number) > 100) throw new Error(`${file}: "trust" must be 0..100`);
  return raw as unknown as NeighborDef;
}

const CHOICE_EFFECTS = ["resources", "villagers", "sick", "trust", "influence", "joinWar", "defendAlly", "answerAllyCall", "ignoreAllyCall"];
const MAX_CHOICE_EFFECT = 1000;

/** Checks one choice event file. Building and season ids are checked in buildContent. */
export function validateChoice(raw: unknown, file = "choice"): ChoiceEventDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "title", "icon", "story"], file);
  if (!/^[a-z0-9-]+$/.test(raw.id as string)) throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  if (raw.neighbor !== undefined && !["any", "ally", "independent"].includes(raw.neighbor as string)) {
    throw new Error(`${file}: "neighbor" must be "any", "ally" or "independent"`);
  }
  if (raw.weight === undefined) raw.weight = 1;
  if (!isNonNegNumber(raw.weight) || raw.weight === 0) throw new Error(`${file}: "weight" must be a number > 0`);
  const c = raw.conditions ?? {};
  if (!isObject(c)) throw new Error(`${file}: "conditions" must be an object`);
  if (typeof c.season === "string") c.season = [c.season];
  if (c.season !== undefined && (!Array.isArray(c.season) || c.season.length === 0 || !c.season.every((x) => typeof x === "string"))) {
    throw new Error(`${file}: "conditions.season" must be a season id or a list of them`);
  }
  for (const k of ["hasBuilding", "lacksBuilding"]) {
    if (c[k] !== undefined && (typeof c[k] !== "string" || c[k] === "")) throw new Error(`${file}: "conditions.${k}" must be a building id`);
  }
  if (c.allied !== undefined && c.allied !== true) throw new Error(`${file}: "conditions.allied" can only be true`);
  if (c.allyAtWar !== undefined && c.allyAtWar !== true) throw new Error(`${file}: "conditions.allyAtWar" can only be true`);
  if (c.allyCall !== undefined && c.allyCall !== true) throw new Error(`${file}: "conditions.allyCall" can only be true`);
  if (c.minVillagers !== undefined && (!Number.isInteger(c.minVillagers) || (c.minVillagers as number) < 0)) {
    throw new Error(`${file}: "conditions.minVillagers" must be a whole number >= 0`);
  }
  for (const k of Object.keys(c)) {
    if (!["season", "hasBuilding", "lacksBuilding", "allied", "minVillagers", "allyAtWar", "allyCall"].includes(k)) throw new Error(`${file}: unknown condition "${k}"`);
  }
  raw.conditions = c;
  if (!Array.isArray(raw.choices) || raw.choices.length < 2 || raw.choices.length > 3) throw new Error(`${file}: needs 2 or 3 "choices"`);
  const ids = new Set<string>();
  const usesNeighbor = raw.neighbor !== undefined || c.allied === true;
  // A call for help names the raider as {enemy}, like a war.
  const atWar = c.allyAtWar === true || c.allyCall === true;
  const call = c.allyCall === true;
  raw.choices.forEach((o, i) => {
    const where = `${file}: choices[${i}]`;
    if (!isObject(o)) throw new Error(`${where} must be an object`);
    checkStrings(o, ["id", "label", "result"], where);
    if (ids.has(o.id as string)) throw new Error(`${where}: id "${String(o.id)}" is used twice`);
    ids.add(o.id as string);
    const e = o.effects;
    if (!isObject(e)) throw new Error(`${where}: needs "effects" (use {} for none)`);
    for (const [k, v] of Object.entries(e)) {
      if (!CHOICE_EFFECTS.includes(k)) throw new Error(`${where}: unknown effect "${k}"`);
      if (k === "resources") {
        if (!isObject(v)) throw new Error(`${where}: effects.resources must be an object`);
        for (const [r, n] of Object.entries(v)) {
          if (!(RESOURCES as readonly string[]).includes(r)) throw new Error(`${where}: unknown resource "${r}"`);
          if (!Number.isInteger(n) || Math.abs(n as number) > MAX_CHOICE_EFFECT) throw new Error(`${where}: effects.resources.${r} must be a whole number`);
        }
      } else if (k === "joinWar") {
        if (v !== true || !atWar) throw new Error(`${where}: "joinWar" can only be true, in an event with "allyAtWar"`);
      } else if (k === "answerAllyCall" || k === "ignoreAllyCall") {
        if (v !== true || !call) throw new Error(`${where}: "${k}" can only be true, in an event with "allyCall"`);
      } else if (k === "defendAlly") {
        if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 100 || !atWar) throw new Error(`${where}: "defendAlly" must be 1–100, in an event with "allyAtWar"`);
      } else if (!Number.isInteger(v) || Math.abs(v as number) > MAX_CHOICE_EFFECT) {
        throw new Error(`${where}: effects.${k} must be a whole number`);
      }
      if ((k === "trust" || k === "influence") && !usesNeighbor) throw new Error(`${where}: "${k}" needs the event to name a "neighbor" (or be "allied")`);
    }
  });
  const texts = [raw.story as string, ...(raw.choices as Record<string, string>[]).flatMap((o) => [o.label, o.result])];
  for (const p of texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)])) {
    if (p[1] === "enemy" && atWar) continue;
    if (p[1] !== "neighbor" && p[1] !== "datu") throw new Error(`${file}: unknown placeholder {${p[1]}}`);
    if (!usesNeighbor) throw new Error(`${file}: {${p[1]}} needs the event to name a "neighbor"`);
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0 || !raw.sources.every((x) => typeof x === "string" && x !== "")) {
    throw new Error(`${file}: a choice event needs at least one source for its history`);
  }
  return raw as unknown as ChoiceEventDef;
}

const isText = (v: unknown): v is Text => isObject(v) && typeof v.en === "string" && v.en !== "" && typeof v.fil === "string" && v.fil !== "";

/** Checks one task file (content/quests). Building and season ids are checked in buildContent. */
export function validateQuest(raw: unknown, file = "quest"): QuestDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  if (typeof raw.id !== "string" || !/^[a-z0-9-]+$/.test(raw.id)) throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  if (!isText(raw.text)) throw new Error(`${file}: "text" needs "en" and "fil"`);
  const c = raw.condition;
  if (!isObject(c) || !(QUEST_CONDITIONS as readonly unknown[]).includes(c.type)) {
    throw new Error(`${file}: "condition.type" must be one of ${QUEST_CONDITIONS.join(", ")}`);
  }
  if (!["traded", "survivedSeason", "leadBloc", "paramount"].includes(c.type as string) && (!Number.isInteger(c.count) || (c.count as number) < 1)) {
    throw new Error(`${file}: "condition.count" must be a whole number >= 1`);
  }
  if (c.type === "built" && typeof c.building !== "string") throw new Error(`${file}: "condition.building" is missing`);
  if (c.type === "built" && c.also !== undefined && (!Array.isArray(c.also) || !c.also.every((x) => typeof x === "string"))) throw new Error(`${file}: "condition.also" must list building ids`);
  if (c.type === "survivedSeason" && typeof c.season !== "string") throw new Error(`${file}: "condition.season" is missing`);
  const r = raw.reward;
  if (!isObject(r) || (r.resources === undefined && r.title === undefined)) throw new Error(`${file}: "reward" needs "resources" or "title"`);
  if (r.resources !== undefined) checkAmounts(r.resources, `${file}: reward.resources`);
  if (r.title !== undefined && !isText(r.title)) throw new Error(`${file}: "reward.title" needs "en" and "fil"`);
  if (raw.next !== null && typeof raw.next !== "string") throw new Error(`${file}: "next" must be a task id or null`);
  if (raw.first !== undefined && typeof raw.first !== "boolean") throw new Error(`${file}: "first" must be true or false`);
  return raw as unknown as QuestDef;
}

/** Puts the tasks in chain order and checks the chain: one first task, every next exists, no loops, nothing left out. */
export function questChain(quests: QuestDef[], buildingIds: Set<string>, seasonIds: string[]): QuestDef[] {
  if (quests.length === 0) return [];
  const byId = new Map<string, QuestDef>();
  for (const q of quests) {
    if (byId.has(q.id)) throw new Error(`Two tasks share the id "${q.id}"`);
    byId.set(q.id, q);
    if (q.condition.type === "built" && !buildingIds.has(q.condition.building)) throw new Error(`quest ${q.id}: unknown building "${q.condition.building}"`);
    for (const b of q.condition.type === "built" ? (q.condition.also ?? []) : []) if (!buildingIds.has(b)) throw new Error(`quest ${q.id}: unknown building "${b}"`);
    if (q.condition.type === "survivedSeason" && !seasonIds.includes(q.condition.season)) throw new Error(`quest ${q.id}: unknown season "${q.condition.season}"`);
  }
  const firsts = quests.filter((q) => q.first);
  if (firsts.length !== 1) throw new Error(`Exactly one task must be "first" (found ${firsts.length})`);
  const chain: QuestDef[] = [];
  for (let q: QuestDef | undefined = firsts[0]; q; q = q.next === null ? undefined : byId.get(q.next)) {
    if (chain.includes(q)) throw new Error(`quest ${q.id}: the chain loops`);
    chain.push(q);
    if (q.next !== null && !byId.has(q.next)) throw new Error(`quest ${q.id}: "next" names unknown task "${q.next}"`);
  }
  const left = quests.filter((q) => !chain.includes(q));
  if (left.length) throw new Error(`quest ${left[0].id}: not in the chain from the first task`);
  return chain;
}

const NO_VILLAGERS: VillagerContent = { chance: 0, names: [], women: [], men: [], datuWomen: [], stories: [], roleBuildings: {} };

/** Checks content/villagers.json and the villager names in content/names.json. */
/** No arrivals file (hand-made test content): newcomers come for land, with plain words. */
const NO_ARRIVALS: ArrivalContent = {
  birth: { en: "A child was born to {mother} and {father}: {child}.", fil: "Isinilang ang anak nina {mother} at {father}: si {child}." },
  reasons: [{ id: "land", weight: 1, size: [1, 1], text: { en: "{names} came looking for land.", fil: "Dumating si {names} upang maghanap ng lupa." } }],
};

const FAMILY_KEYS = ["born", "bornNoParents", "arrived", "arrivedNoPlace", "founder", "spouse", "child", "children", "and"];
const EVENT_KEYS = ["born", "arrived", "arrivedFrom", "married", "parent", "grewUp", "elder", "raidWon", "raidLost", "defendedWon", "defendedLost", "sick", "healed", "learned", "learnedAlone", "died", "honored", "socialSipa", "socialWrestling", "socialAgong", "socialAgongAlone", "socialSong", "socialFlute", "socialBayanihan", "socialBayanihanAlone", "diedAttack", "diedDefense", "diedAge", "diedSickness", "diedHunger", "day"];
const CAUSE_KEYS = ["age", "sickness", "raid", "hunger"];

/** No life-story file (hand-made test content): one plain skill and detail, plain words. */
const t = (en: string): Text => ({ en, fil: en });
const NO_TALAMBUHAY: TalambuhayContent = {
  skills: [{ id: "farming", text: t("{name} works the fields.") }],
  details: [{ id: "river", kind: "place", text: t("{name} likes the river.") }],
  family: Object.fromEntries(FAMILY_KEYS.map((k) => [k, t(k === "and" ? " and " : `{name} (${k}).`)])),
  events: Object.fromEntries(EVENT_KEYS.map((k) => [k, t(k === "day" ? "Araw {n}" : k)])),
  causes: Object.fromEntries(CAUSE_KEYS.map((k) => [k, t(k)])),
  lessons: [{ id: "old-songs", text: t("the old songs") }],
};

/** Checks content/villagers/talambuhay.json. */
export function validateTalambuhay(raw: unknown): TalambuhayContent {
  if (raw === undefined) return NO_TALAMBUHAY;
  const file = "villagers/talambuhay.json";
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  const list = <T>(key: string, each: (o: Record<string, unknown>, at: string) => T): T[] => {
    const l = raw[key];
    if (!Array.isArray(l) || l.length === 0) throw new Error(`${file}: "${key}" must list at least one entry`);
    const seen = new Set<string>();
    return l.map((o, i) => {
      const at = `${file}: ${key} ${i + 1}`;
      if (!isObject(o) || typeof o.id !== "string" || o.id === "" || o.id.length > 40 || seen.has(o.id)) throw new Error(`${at}: needs a unique "id"`);
      seen.add(o.id);
      if (!isText(o.text)) throw new Error(`${at}: "text" needs en and fil`);
      return each(o, at);
    });
  };
  const skills = list("skills", (o, at): TalambuhaySkill => {
    if (o.roles !== undefined && (!Array.isArray(o.roles) || !o.roles.every((r) => (VILLAGER_ROLES as readonly unknown[]).includes(r)))) throw new Error(`${at}: "roles" must list roles (${VILLAGER_ROLES.join(", ")})`);
    return { id: o.id as string, text: o.text as Text, ...(o.roles ? { roles: o.roles as VillagerRole[] } : {}) };
  });
  for (const role of VILLAGER_ROLES) if (!skills.some((s) => !s.roles || s.roles.includes(role))) throw new Error(`${file}: no skill fits the role "${role}"`);
  const details = list("details", (o, at): TalambuhayDetail => {
    if (!(DETAIL_KINDS as readonly unknown[]).includes(o.kind)) throw new Error(`${at}: "kind" must be one of ${DETAIL_KINDS.join(", ")}`);
    return { id: o.id as string, kind: o.kind as TalambuhayDetail["kind"], text: o.text as Text };
  });
  const lessons = list("lessons", (o) => ({ id: o.id as string, text: o.text as Text }));
  const texts = (key: string, keys: string[]): Record<string, Text> => {
    const o = raw[key];
    if (!isObject(o)) throw new Error(`${file}: "${key}" must be an object`);
    for (const k of keys) if (!isText(o[k])) throw new Error(`${file}: "${key}.${k}" needs en and fil`);
    return Object.fromEntries(keys.map((k) => [k, o[k] as Text]));
  };
  return { skills, details, lessons, family: texts("family", FAMILY_KEYS), events: texts("events", EVENT_KEYS), causes: texts("causes", CAUSE_KEYS) };
}

export function validateArrivals(raw: unknown): ArrivalContent {
  if (raw === undefined) return NO_ARRIVALS;
  const file = "villagers/arrivals.json";
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  if (!isText(raw.birth)) throw new Error(`${file}: "birth" needs en and fil`);
  if (!Array.isArray(raw.reasons) || raw.reasons.length === 0) throw new Error(`${file}: "reasons" must list at least one reason`);
  const seen = new Set<string>();
  const reasons = raw.reasons.map((r, i): ArrivalReason => {
    const at = `${file}: reason ${i + 1}`;
    if (!isObject(r) || typeof r.id !== "string" || r.id === "" || seen.has(r.id)) throw new Error(`${at}: needs a unique "id"`);
    seen.add(r.id);
    if (!isNonNegNumber(r.weight)) throw new Error(`${at}: "weight" must be a number >= 0`);
    if (r.boost !== undefined && !isNonNegNumber(r.boost)) throw new Error(`${at}: "boost" must be a number >= 0`);
    if (r.needs !== undefined && !(ARRIVAL_NEEDS as readonly unknown[]).includes(r.needs)) throw new Error(`${at}: "needs" must be one of ${ARRIVAL_NEEDS.join(", ")}`);
    const size = r.size;
    if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isInteger(n) && (n as number) >= 1) || (size[0] as number) > (size[1] as number)) {
      throw new Error(`${at}: "size" must be [fewest, most], whole numbers from 1`);
    }
    if (!isText(r.text)) throw new Error(`${at}: "text" needs en and fil`);
    return {
      id: r.id,
      weight: r.weight,
      ...(r.needs ? { needs: r.needs as ArrivalNeed } : {}),
      ...(r.boost !== undefined ? { boost: r.boost } : {}),
      ...(r.spouse === true ? { spouse: true } : {}),
      size: [size[0] as number, size[1] as number],
      text: r.text,
    };
  });
  if (!reasons.some((r) => !r.needs && r.weight > 0)) throw new Error(`${file}: at least one reason must be possible at any time (no "needs", weight > 0)`);
  return { birth: raw.birth, reasons };
}

export function validateVillagers(raw: unknown, rawNames: unknown, buildingIds: Set<string>): VillagerContent {
  if (raw === undefined) return NO_VILLAGERS;
  const file = "villagers.json";
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  if (!isNonNegNumber(raw.chance) || raw.chance > 1) throw new Error(`${file}: "chance" must be 0–1`);
  const byGender = isObject(rawNames) ? rawNames.villagers : undefined;
  const list = (key: string): string[] => {
    const l = isObject(byGender) ? byGender[key] : undefined;
    if (!Array.isArray(l) || l.length === 0 || !l.every((n) => typeof n === "string" && n !== "" && n.length <= 30)) {
      throw new Error(`names.json: "villagers.${key}" must list names (at most 30 characters each)`);
    }
    return l as string[];
  };
  const women = list("women");
  const men = list("men");
  const names = [...women, ...men];
  if (new Set(names).size !== names.length) throw new Error('names.json: a villager name is listed twice');
  const dw = isObject(rawNames) ? rawNames.datuWomen : undefined;
  const datuWomen = Array.isArray(dw) && dw.every((n) => typeof n === "string") ? (dw as string[]) : [];
  const datu = isObject(rawNames) && Array.isArray(rawNames.datu) ? rawNames.datu : [];
  for (const n of datuWomen) if (!datu.includes(n)) throw new Error(`names.json: "datuWomen" lists ${n}, which isn't in "datu"`);
  if (!Array.isArray(raw.stories) || raw.stories.length === 0) throw new Error(`${file}: "stories" must list at least one story`);
  const ids = new Set<string>();
  for (const st of raw.stories) {
    if (!isObject(st) || typeof st.id !== "string" || st.id === "") throw new Error(`${file}: every story needs an "id"`);
    if (ids.has(st.id)) throw new Error(`${file}: two stories share the id "${st.id}"`);
    ids.add(st.id);
    if (!(VILLAGER_ROLES as readonly unknown[]).includes(st.role)) throw new Error(`${file}: story ${st.id}: "role" must be one of ${VILLAGER_ROLES.join(", ")}`);
    if (!isText(st.text) || !st.text.en.includes("{name}") || !st.text.fil.includes("{name}")) throw new Error(`${file}: story ${st.id}: "text" needs "en" and "fil", each with {name}`);
  }
  const rb = raw.roleBuildings;
  if (!isObject(rb)) throw new Error(`${file}: "roleBuildings" must be an object`);
  for (const [role, id] of Object.entries(rb)) {
    if (!(VILLAGER_ROLES as readonly string[]).includes(role) || typeof id !== "string" || !buildingIds.has(id)) {
      throw new Error(`${file}: roleBuildings.${role} must name a building`);
    }
  }
  return { chance: raw.chance, names, women, men, datuWomen, stories: raw.stories as unknown as VillagerStory[], roleBuildings: rb as VillagerContent["roleBuildings"] };
}

/** Checks content/levels.json: one reward per level from 2 up, resources or a title. */
export function validateLevels(raw: unknown, rules: Rules): LevelDef[] {
  if (raw === undefined) return [];
  if (!isObject(raw) || !Array.isArray(raw.levels)) throw new Error('levels.json: needs "levels"');
  const max = rules.kabantugan.levelAt.length + 1;
  return raw.levels.map((l, i) => {
    const where = `levels.json: levels[${i}]`;
    if (!isObject(l) || !Number.isInteger(l.level) || (l.level as number) < 2 || (l.level as number) > max) throw new Error(`${where}: "level" must be 2..${max}`);
    const r = l.reward;
    if (!isObject(r) || (r.resources === undefined && r.title === undefined)) throw new Error(`${where}: "reward" needs "resources" or "title"`);
    if (r.resources !== undefined) checkAmounts(r.resources, `${where}: reward.resources`);
    if (r.title !== undefined) checkText(r.title, `${where}: reward.title`);
    return l as unknown as LevelDef;
  });
}

/** Checks one scripted political event (content/events/politics). */
export function validatePolitics(raw: unknown, file = "politics"): PoliticsEventDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id"], file);
  if (!(POLITICS_TYPES as readonly unknown[]).includes(raw.type)) throw new Error(`${file}: "type" must be one of ${POLITICS_TYPES.join(", ")}`);
  const text = checkText(raw.text, `${file}: text`);
  for (const lang of ["en", "fil"] as const) {
    for (const m of text[lang].matchAll(/\{(\w+)\}/g)) if (!["datu", "barangay", "bloc", "other"].includes(m[1])) throw new Error(`${file}: unknown placeholder {${m[1]}}`);
  }
  if (raw.weight !== undefined && !isNonNegNumber(raw.weight)) throw new Error(`${file}: "weight" must be a number >= 0`);
  return { ...(raw as unknown as PoliticsEventDef), weight: (raw.weight as number | undefined) ?? 1 };
}

/** The cultural rule: a tradition, at least one source, and a reviewed flag. */
function checkHeritage(raw: Record<string, unknown>, file: string) {
  if (typeof raw.tradition !== "string" || raw.tradition === "") throw new Error(`${file}: needs a "tradition"`);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0 || !raw.sources.every((x) => typeof x === "string" && x !== "")) {
    throw new Error(`${file}: needs at least one source`);
  }
  if (typeof raw.reviewed !== "boolean") throw new Error(`${file}: needs "reviewed": true or false`);
}

function checkText(v: unknown, where: string): Text {
  if (!isText(v)) throw new Error(`${where} needs "en" and "fil" text`);
  return v;
}

export function validateTradition(raw: unknown, file = "tradition"): TraditionDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id"], file);
  checkHeritage(raw, file);
  for (const k of ["name", "description", "burial"]) checkText(raw[k], `${file}: ${k}`);
  if (!Array.isArray(raw.beings) || !raw.beings.every((b) => typeof b === "string")) throw new Error(`${file}: "beings" must list lore ids`);
  if (!isObject(raw.rituals)) throw new Error(`${file}: missing "rituals"`);
  for (const k of ["offering", "permission", "healer"]) checkText(raw.rituals[k], `${file}: rituals.${k}`);
  const fs = raw.forestSpirit;
  if (!isObject(fs)) throw new Error(`${file}: missing "forestSpirit"`);
  for (const k of ["name", "stage1", "stage2"]) checkText(fs[k], `${file}: forestSpirit.${k}`);
  if (!Array.isArray(fs.sources) || fs.sources.length === 0) throw new Error(`${file}: forestSpirit needs a source`);
  checkNumbers(raw, ["sarimanokChance"], file);
  if (raw.foodYield !== undefined) {
    if (!isObject(raw.foodYield)) throw new Error(`${file}: "foodYield" must map building ids to percents`);
    checkNumbers(raw.foodYield, Object.keys(raw.foodYield), `${file}: foodYield`);
  }
  if (raw.pigs !== undefined && typeof raw.pigs !== "boolean") throw new Error(`${file}: "pigs" must be true or false`);
  if (raw.honorMark !== undefined) {
    const h = raw.honorMark;
    if (!isObject(h) || (h.kind !== "batok" && h.kind !== "ornament") || !Array.isArray(h.sources) || h.sources.length === 0 || typeof h.reviewed !== "boolean") {
      throw new Error(`${file}: "honorMark" needs a kind ("batok" or "ornament"), sources and "reviewed"`);
    }
  }
  if (raw.womanHonorific !== undefined) {
    const h = raw.womanHonorific;
    if (!isObject(h) || typeof h.term !== "string" || h.term.trim() === "" || !Array.isArray(h.sources) || h.sources.length === 0 || typeof h.reviewed !== "boolean") {
      throw new Error(`${file}: "womanHonorific" needs a term, sources and "reviewed"`);
    }
  }
  if (raw.burialLook !== "jars" && raw.burialLook !== "longon") throw new Error(`${file}: "burialLook" must be "jars" or "longon"`);
  if (raw.houseStyle !== undefined && raw.houseStyle !== "lowland" && raw.houseStyle !== "torogan") throw new Error(`${file}: "houseStyle" must be "lowland" or "torogan"`);
  if (raw.dress !== undefined && raw.dress !== "malong") throw new Error(`${file}: "dress" must be "malong" when given`);
  if (raw.classes !== undefined) {
    const cl = raw.classes;
    if (!isObject(cl) || !SOCIAL_CLASSES.every((c) => isObject(cl[c]) && isText(cl[c].name) && isText(cl[c].about))) {
      throw new Error(`${file}: "classes" needs ${SOCIAL_CLASSES.join(", ")}, each with "name" and "about" in every language`);
    }
  }
  return raw as unknown as TraditionDef;
}

type Blessing = GroveBlessing | RitualDef | VisitorDef | EclipseDef | TrickeryDef;

/** Checks one file in content/blessings: a grove, a ritual, a visitor or an event. */
export function validateBlessing(raw: unknown, file = "blessing"): Blessing {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  if (raw.type === "grove") {
    const g = validateGrove(raw, file);
    checkHeritage(raw, file);
    return g;
  }
  checkStrings(raw, ["id"], file);
  checkHeritage(raw, file);
  checkText(raw.name, `${file}: name`);
  checkText(raw.description, `${file}: description`);
  switch (raw.type) {
    case "ritual":
      checkNumbers(raw, ["favorCost", "cooldownSeconds", "forestRestore"], file);
      if (raw.productionPercent !== undefined) checkNumbers(raw, ["productionPercent", "durationSeconds"], file, true);
      if (raw.riceMinutes !== undefined) checkNumbers(raw, ["riceMinutes"], file, true);
      if (raw.mourningShortenPercent !== undefined && (!isNonNegNumber(raw.mourningShortenPercent) || raw.mourningShortenPercent > 100)) throw new Error(`${file}: "mourningShortenPercent" must be 0–100`);
      if (raw.productionPercent === undefined && raw.riceMinutes === undefined && raw.mourningShortenPercent === undefined) {
        throw new Error(`${file}: a ritual needs "productionPercent", "riceMinutes" or "mourningShortenPercent"`);
      }
      return raw as unknown as RitualDef;
    case "visitor": {
      checkNumbers(raw, ["chancePerSecond", "minVillagers", "visibleSeconds", "cooldownSeconds"], file);
      const r = raw.rewards;
      if (!isObject(r) || Object.keys(r).length === 0) throw new Error(`${file}: "rewards" must list resources`);
      for (const [k, v] of Object.entries(r)) {
        if (!(RESOURCES as readonly string[]).includes(k) || !Array.isArray(v) || v.length !== 2 || !v.every(isNonNegNumber) || v[0] > v[1]) {
          throw new Error(`${file}: rewards.${k} must be [min, max]`);
        }
      }
      return raw as unknown as VisitorDef;
    }
    case "eclipse":
      checkNumbers(raw, ["minVillagers", "chancePerSecond", "cooldownSeconds"], file);
      checkNumbers(raw, ["durationSeconds", "gongsNeeded"], file, true);
      if (!isObject(raw.success) || !isObject(raw.failure)) throw new Error(`${file}: needs "success" and "failure"`);
      checkNumbers(raw.success, ["favor", "gold"], `${file}: success`);
      checkNumbers(raw.failure, ["ricePercent"], `${file}: failure`);
      return raw as unknown as EclipseDef;
    case "trickery": {
      checkNumbers(raw, ["minVillagers", "chancePerSecond", "lowForestMultiplier", "cooldownSeconds"], file);
      checkNumbers(raw, ["lostSeconds", "workersLost"], file, true);
      if (!Array.isArray(raw.riddles) || raw.riddles.length === 0) throw new Error(`${file}: needs at least one riddle`);
      for (const r of raw.riddles) {
        if (!isObject(r) || typeof r.id !== "string") throw new Error(`${file}: every riddle needs an "id"`);
        checkText(r.question, `${file}: riddle ${r.id} question`);
        if (!Array.isArray(r.options) || r.options.length < 2) throw new Error(`${file}: riddle ${r.id} needs at least two options`);
        r.options.forEach((o, i) => checkText(o, `${file}: riddle ${r.id} option ${i}`));
        if (!Number.isInteger(r.answer) || (r.answer as number) < 0 || (r.answer as number) >= r.options.length) throw new Error(`${file}: riddle ${r.id} "answer" must be an option's index`);
      }
      return raw as unknown as TrickeryDef;
    }
    default:
      throw new Error(`${file}: unknown blessing type "${String(raw.type)}"`);
  }
}

const UNLOCK_TYPES = ["built", "near", "grove", "path", "flag", "tradition", "report", "burial", "any"];

function checkUnlock(u: unknown, where: string, ctx: { buildings: Set<string> }): void {
  if (!isObject(u) || !UNLOCK_TYPES.includes(u.type as string)) throw new Error(`${where}: "unlock.type" must be one of ${UNLOCK_TYPES.join(", ")}`);
  if (u.type === "built" && !ctx.buildings.has(u.building as string)) throw new Error(`${where}: unknown building "${String(u.building)}"`);
  if (u.type === "near" && (u.tile !== "balete" || !isNonNegNumber(u.radius))) throw new Error(`${where}: "near" needs tile "balete" and a radius`);
  for (const k of ["path", "flag", "tradition", "kind"] as const) {
    if (u.type === (k === "kind" ? "report" : k) && (typeof u[k] !== "string" || u[k] === "")) throw new Error(`${where}: "${u.type}" needs "${k}"`);
  }
  if (u.type === "burial" && u.look !== "jars" && u.look !== "longon") throw new Error(`${where}: "burial" needs look "jars" or "longon"`);
  if (u.type === "any") {
    if (!Array.isArray(u.of) || u.of.length === 0) throw new Error(`${where}: "any" needs a list in "of"`);
    for (const x of u.of) checkUnlock(x, where, ctx);
  }
}

/** The Aklat part of a lore note (if it has one), with the cultural fields. */
export function validateAklat(note: LoreNote, file: string, ctx: { buildings: Set<string> }): AklatEntry | null {
  checkHeritage(note, file);
  const a = note.aklat;
  if (a === undefined) return null;
  if (!isObject(a)) throw new Error(`${file}: "aklat" must be an object`);
  if (!Number.isFinite(a.order)) throw new Error(`${file}: aklat.order must be a number`);
  if (typeof a.icon !== "string" || a.icon === "") throw new Error(`${file}: aklat.icon is missing`);
  for (const k of ["name", "lore", "inGame", "hint"]) checkText(a[k], `${file}: aklat.${k}`);
  checkUnlock(a.unlock, `${file}: aklat`, ctx);
  return { id: note.id, aklat: a as unknown as AklatDef, tradition: note.tradition!, sources: note.sources, reviewed: note.reviewed as boolean };
}

export function buildContent(
  buildingFiles: Record<string, unknown>,
  rawRules: unknown,
  eventFiles: Record<string, unknown> = {},
  loreFiles: Record<string, unknown> = {},
  blessingFiles: Record<string, unknown> = {},
  neighborFiles: Record<string, unknown> = {},
  choiceFiles: Record<string, unknown> = {},
  extra: {
    quests?: Record<string, unknown>;
    villagers?: unknown;
    /** content/villagers/*.json, by file name. */
    villagerFiles?: Record<string, unknown>;
    names?: unknown;
    traditions?: Record<string, unknown>;
    islands?: unknown;
    politics?: Record<string, unknown>;
    levels?: unknown;
  } = {},
): Content {
  const all = Object.entries(buildingFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => validateBuilding(raw, file))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  // The Bahay ng Datu is one house at the plaza, raised by level: kept apart from what can be placed.
  const houses = all.filter((b) => b.datuHouse);
  if (houses.length > 1) throw new Error("Only one building may be the Bahay ng Datu");
  const datuHouse = (houses[0] as (BuildingDef & { datuHouse: DatuHouseDef }) | undefined) ?? null;
  const buildings = all.filter((b) => !b.datuHouse);
  const ids = new Set<string>();
  for (const b of buildings) {
    if (ids.has(b.id)) throw new Error(`Duplicate building id "${b.id}"`);
    ids.add(b.id);
  }
  for (const b of buildings) {
    for (const target of b.adjacencyBonus?.nextTo ?? []) {
      if (!(TERRAINS as readonly string[]).includes(target) && !ids.has(target)) {
        throw new Error(`${b.id}: adjacencyBonus.nextTo has unknown terrain or building "${target}"`);
      }
    }
  }
  const rules = validateRules(rawRules);
  for (const id of [...rules.clearing.borrow.order, ...rules.clearing.borrow.protect]) {
    if (!ids.has(id)) throw new Error(`rules: clearing.borrow mentions unknown building "${id}"`);
  }
  for (const id of Object.keys(rules.start.buildings)) {
    if (!ids.has(id)) throw new Error(`rules: start.buildings mentions unknown building "${id}"`);
  }

  const events: Events = {};
  for (const [file, raw] of Object.entries(eventFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const event = validateEvent(raw, file);
    if (events[event.type]) throw new Error(`${file}: there is already a "${event.type}" event`);
    if (event.type === "sickness" && !ids.has(event.crowding.building)) {
      throw new Error(`${file}: crowding.building "${event.crowding.building}" is not a building`);
    }
    if (event.type === "fire" && !ids.has(event.target)) {
      throw new Error(`${file}: target "${event.target}" is not a building`);
    }
    (events as Record<string, EventDef>)[event.type] = event;
  }
  const lore: Record<string, LoreNote> = {};
  for (const [file, raw] of Object.entries(loreFiles)) {
    const note = validateLore(raw, file);
    lore[note.id] = note;
  }
  const blessings = Object.entries(blessingFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const b = validateBlessing(raw, file);
      if (b.lore && !lore[b.lore]) throw new Error(`${file}: "lore" names unknown lore note "${b.lore}"`);
      if (b.type === "grove" && !ids.has(b.affects)) throw new Error(`${file}: "affects" names unknown building "${b.affects}"`);
      return b;
    });
  const groves = blessings.filter((b): b is GroveBlessing => b.type === "grove");
  const rituals = blessings.filter((b): b is RitualDef => b.type === "ritual");
  const one = <T extends Blessing>(type: T["type"]) => {
    const list = blessings.filter((b) => b.type === type);
    if (list.length > 1) throw new Error(`Only one blessing of type "${type}" is supported`);
    return (list[0] as T | undefined) ?? null;
  };
  const visitor = one<VisitorDef>("visitor");
  const eclipse = one<EclipseDef>("eclipse");
  const trickery = one<TrickeryDef>("trickery");
  const aklat = Object.entries(loreFiles)
    .map(([file, raw]) => validateAklat(raw as LoreNote, file, { buildings: ids }))
    .filter((e): e is AklatEntry => e !== null)
    .sort((a, b) => a.aklat.order - b.aklat.order);
  const traditions = Object.entries(extra.traditions ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const t = validateTradition(raw, file);
      for (const id of t.beings) if (!lore[id]) throw new Error(`${file}: "beings" names unknown lore note "${id}"`);
      return t;
    });
  if (new Set(traditions.map((t) => t.id)).size !== traditions.length) throw new Error("Two traditions share an id");
  traditions.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  for (const b of buildings) {
    if (b.requiresNear && !ids.has(b.requiresNear.building)) throw new Error(`${b.id}: requiresNear names unknown building "${b.requiresNear.building}"`);
  }
  const neighbors = Object.entries(neighborFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const n = validateNeighbor(raw, file);
      if (!rules.diplomacy.traits[n.trait]) throw new Error(`${file}: unknown trait "${n.trait}"`);
      for (const id of Object.keys(n.start.buildings)) {
        if (!ids.has(id)) throw new Error(`${file}: start.buildings mentions unknown building "${id}"`);
      }
      return n;
    })
    // Home-island neighbors first, upstream to downstream; then the rest by id.
    .sort((a, b) => Number(!!b.home) - Number(!!a.home) || (a.river?.position ?? 2) - (b.river?.position ?? 2) || a.id.localeCompare(b.id));
  if (new Set(neighbors.map((n) => n.id)).size !== neighbors.length) throw new Error("Two neighbors share an id");
  const seasonIds = events.seasons?.seasons.map((s) => s.id) ?? [];
  const choices = Object.entries(choiceFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const c = validateChoice(raw, file);
      for (const k of ["hasBuilding", "lacksBuilding"] as const) {
        const id = c.conditions[k];
        if (id && !ids.has(id)) throw new Error(`${file}: conditions.${k} names unknown building "${id}"`);
      }
      for (const id of c.conditions.season ?? []) if (!seasonIds.includes(id)) throw new Error(`${file}: unknown season "${id}"`);
      return c;
    });
  if (new Set(choices.map((c) => c.id)).size !== choices.length) throw new Error("Two choice events share an id");
  const quests = questChain(
    Object.entries(extra.quests ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, raw]) => validateQuest(raw, file)),
    ids,
    seasonIds,
  );
  const villagers = validateVillagers(extra.villagers, extra.names, ids);
  const arrivals = validateArrivals(Object.entries(extra.villagerFiles ?? {}).find(([f]) => f.endsWith("arrivals.json"))?.[1]);
  const talambuhay = validateTalambuhay(Object.entries(extra.villagerFiles ?? {}).find(([f]) => f.endsWith("talambuhay.json"))?.[1]);
  const islandsRaw = extra.islands;
  const islands = isObject(islandsRaw) && Array.isArray(islandsRaw.names) ? islandsRaw.names.filter((n): n is string => typeof n === "string" && n !== "") : [];
  if (extra.islands !== undefined && islands.length < rules.archipelago.maxIslands) throw new Error(`islands.json: needs at least ${rules.archipelago.maxIslands} names`);
  const politics = Object.entries(extra.politics ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => validatePolitics(raw, file));
  for (const n of neighbors) if (n.tradition && !traditions.some((t) => t.id === n.tradition)) throw new Error(`${n.id}: unknown tradition "${n.tradition}"`);
  const levels = validateLevels(extra.levels, rules);
  return { buildings, rules, events, lore, groves, neighbors, choices, quests, villagers, arrivals, talambuhay, traditions, rituals, visitor, eclipse, trickery, aklat, datuHouse, islands, politics, levels };
}

/** Loads every JSON file in content/ at build time (Vite bundles them). */
export function loadContent(): Content {
  const files = import.meta.glob("../../content/buildings/*.json", {
    eager: true,
    import: "default",
  });
  const rules = import.meta.glob("../../content/rules.json", { eager: true, import: "default" });
  const events = import.meta.glob("../../content/events/*.json", { eager: true, import: "default" });
  const lore = import.meta.glob("../../content/lore/*.json", { eager: true, import: "default" });
  const blessings = import.meta.glob("../../content/blessings/*.json", { eager: true, import: "default" });
  const neighbors = import.meta.glob("../../content/neighbors/*.json", { eager: true, import: "default" });
  const choices = import.meta.glob("../../content/events/choices/*.json", { eager: true, import: "default" });
  const quests = import.meta.glob("../../content/quests/*.json", { eager: true, import: "default" });
  const villagers = import.meta.glob("../../content/villagers.json", { eager: true, import: "default" });
  const villagerFiles = import.meta.glob("../../content/villagers/*.json", { eager: true, import: "default" });
  const names = import.meta.glob("../../content/names.json", { eager: true, import: "default" });
  return buildContent(files, Object.values(rules)[0], events, lore, blessings, neighbors, choices, {
    quests,
    villagers: Object.values(villagers)[0],
    villagerFiles,
    names: Object.values(names)[0],
    traditions: import.meta.glob("../../content/traditions/*.json", { eager: true, import: "default" }),
    islands: Object.values(import.meta.glob("../../content/islands.json", { eager: true, import: "default" }))[0],
    politics: import.meta.glob("../../content/events/politics/*.json", { eager: true, import: "default" }),
    levels: Object.values(import.meta.glob("../../content/levels.json", { eager: true, import: "default" }))[0],
  });
}
