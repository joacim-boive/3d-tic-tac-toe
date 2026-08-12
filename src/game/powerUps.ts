import type { PlayerId, PresetId } from "./types";

export type PowerUpId = "extra-turn" | "clear-row" | "tip";

export const POWER_UP_IDS: readonly PowerUpId[] = ["extra-turn", "clear-row", "tip"] as const;

export const POWER_UP_LABELS: Record<PowerUpId, string> = {
  "extra-turn": "Extra turn",
  "clear-row": "Clear row",
  tip: "Tip field",
};

/** Shown when aiming / placing the Extra ball on a finishing cell. */
export const EXTRA_NO_FINISH_TOAST = "Extra can't finish a line";

export const MAX_PER_KIND = 2;
export const SWARM_PACKAGE_COUNT = 3;
/** Earliest ply (occupiedCount) that may trigger a package swarm. */
export const SWARM_MIN_PLY = 7;
/** Chance to fire a swarm after a place once ply gate + cooldown pass. */
export const SWARM_CHANCE = 0.2;
/** After any successful catch, block new swarms for this many plies. */
export const SWARM_COOLDOWN_PLIES = 5;
/**
 * Chance the AI aims at the live pack (else a dud) when racing the human.
 * ~0.5 ≈ a sharp human who usually lands a good first or second tap in time.
 */
export const AI_CATCH_CHANCE = 0.5;
/** How long packages stay on screen (ms). */
export const SWARM_DURATION_MS = 2800;

export type PowerUpCounts = Record<PowerUpId, number>;

export type PowerUpInventory = Record<PlayerId, PowerUpCounts>;

export type SwarmPackagePlan = {
  id: number;
  /** Normalized start 0–1 in overlay space. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Duration scale 0.85–1.15. */
  speed: number;
  delayMs: number;
};

export type SwarmPlan = {
  seed: number;
  liveIndex: 0 | 1 | 2;
  /** Player whose place triggered the flyby (flavor only — either seat may claim). */
  earner: PlayerId;
  packages: SwarmPackagePlan[];
};

export type SwarmTapOutcome = "dud" | "claim" | "deny";

export type Rng = () => number;

/**
 * Extra turn is banned on win-length-3 tiny boards (3×3 flat / 3×3×3) — a
 * second place after one mark is often an instant forced win. On larger boards
 * Extra activates only after the ordinary place, and the bonus ball cannot
 * finish a line.
 */
export function powerUpsForPreset(presetId: PresetId): readonly PowerUpId[] {
  if (presetId === "3x3" || presetId === "3x3x3") {
    return POWER_UP_IDS.filter((id) => id !== "extra-turn");
  }
  return POWER_UP_IDS;
}

export function isPowerUpAllowed(kind: PowerUpId, presetId: PresetId): boolean {
  return powerUpsForPreset(presetId).includes(kind);
}

export function emptyCounts(): PowerUpCounts {
  return { "extra-turn": 0, "clear-row": 0, tip: 0 };
}

export function emptyInventory(): PowerUpInventory {
  return { a: emptyCounts(), b: emptyCounts() };
}

/** Max stacks of every kind — handy for manual testing. */
export function fullInventory(): PowerUpInventory {
  return {
    a: { "extra-turn": MAX_PER_KIND, "clear-row": MAX_PER_KIND, tip: MAX_PER_KIND },
    b: { "extra-turn": MAX_PER_KIND, "clear-row": MAX_PER_KIND, tip: MAX_PER_KIND },
  };
}

export function fullCounts(): PowerUpCounts {
  return { "extra-turn": MAX_PER_KIND, "clear-row": MAX_PER_KIND, tip: MAX_PER_KIND };
}

export function cloneInventory(inv: PowerUpInventory): PowerUpInventory {
  return {
    a: { ...inv.a },
    b: { ...inv.b },
  };
}

export function underCapKinds(counts: PowerUpCounts, presetId?: PresetId): PowerUpId[] {
  const pool = presetId ? powerUpsForPreset(presetId) : POWER_UP_IDS;
  return pool.filter((id) => counts[id] < MAX_PER_KIND);
}

export function hasInventoryRoom(counts: PowerUpCounts, presetId?: PresetId): boolean {
  return underCapKinds(counts, presetId).length > 0;
}

export function canSpend(counts: PowerUpCounts, kind: PowerUpId): boolean {
  return counts[kind] > 0;
}

/** Increment kind if under cap; returns new counts or null if full. */
export function awardPowerUp(
  counts: PowerUpCounts,
  kind: PowerUpId,
  presetId?: PresetId,
): PowerUpCounts | null {
  if (presetId && !isPowerUpAllowed(kind, presetId)) return null;
  if (counts[kind] >= MAX_PER_KIND) return null;
  return { ...counts, [kind]: counts[kind] + 1 };
}

export function spendPowerUp(counts: PowerUpCounts, kind: PowerUpId): PowerUpCounts | null {
  if (counts[kind] <= 0) return null;
  return { ...counts, [kind]: counts[kind] - 1 };
}

export function pickRandomKind(
  counts: PowerUpCounts,
  rng: Rng,
  presetId?: PresetId,
): PowerUpId | null {
  const open = underCapKinds(counts, presetId);
  if (open.length === 0) return null;
  return open[Math.floor(rng() * open.length)]!;
}

/** Should a swarm attempt fire after this place? */
export function shouldAttemptSwarm(opts: {
  powerUpsEnabled: boolean;
  occupiedCount: number;
  /** Occupied-count gate after a recent award; 0 = no cooldown. */
  cooldownUntilPly?: number;
  /** @deprecated Ignored — flybys run even when inventories are full (deny/sabotage). */
  earnerCounts?: PowerUpCounts;
  rng: Rng;
}): boolean {
  if (!opts.powerUpsEnabled) return false;
  if (opts.occupiedCount < SWARM_MIN_PLY) return false;
  if (opts.occupiedCount < (opts.cooldownUntilPly ?? 0)) return false;
  return opts.rng() < SWARM_CHANCE;
}

function edgePoint(rng: Rng, edge: 0 | 1 | 2 | 3): { x: number; y: number } {
  // Spread along most of the edge so crossings fan across the view.
  const t = 0.08 + rng() * 0.84;
  const inset = 0.06;
  switch (edge) {
    case 0:
      return { x: t, y: -inset };
    case 1:
      return { x: 1 + inset, y: t };
    case 2:
      return { x: t, y: 1 + inset };
    default:
      return { x: -inset, y: t };
  }
}

/** Fisher–Yates shuffle (mutates). */
function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Build deterministic flyby paths from a seed — each package from a different direction. */
export function planSwarm(seed: number, earner: PlayerId, rng: Rng): SwarmPlan {
  const liveIndex = Math.floor(rng() * SWARM_PACKAGE_COUNT) as 0 | 1 | 2;
  // Three of four screen edges — packages enter from distinct directions.
  const edgePool: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3];
  const starts = shuffleInPlace(edgePool, rng).slice(0, SWARM_PACKAGE_COUNT);

  const packages: SwarmPackagePlan[] = [];
  for (let i = 0; i < SWARM_PACKAGE_COUNT; i++) {
    const startEdge = starts[i]!;
    // Prefer a clearly different exit — opposite or adjacent, never same.
    let endEdge = ((startEdge + 2) % 4) as 0 | 1 | 2 | 3;
    if (rng() < 0.45) {
      endEdge = ((startEdge + (rng() < 0.5 ? 1 : 3)) % 4) as 0 | 1 | 2 | 3;
    }
    const start = edgePoint(rng, startEdge);
    const end = edgePoint(rng, endEdge);
    packages.push({
      id: i,
      x0: start.x,
      y0: start.y,
      x1: end.x,
      y1: end.y,
      // Wider speed band so they don't travel as a pack.
      speed: 0.7 + rng() * 0.55,
      // Stagger entries so each reads as its own flyby.
      delayMs: i * 280 + Math.floor(rng() * 160),
    });
  }
  return { seed, liveIndex, earner, packages };
}

export function aiCatchRoll(rng: Rng): boolean {
  return rng() < AI_CATCH_CHANCE;
}

/** Which package the AI will tap in the race (live on skill roll, else a dud). */
export function pickAiSwarmTarget(plan: SwarmPlan, rng: Rng): number {
  if (aiCatchRoll(rng)) return plan.liveIndex;
  const duds = plan.packages.map((p) => p.id).filter((id) => id !== plan.liveIndex);
  return duds[Math.floor(rng() * duds.length)]!;
}

/**
 * Live claim/deny ends the race: stamp the live outcome and mark every other
 * still-flying pack as a dud so the 3D shatter FX can fire for all of them
 * before (or as) the swarm clears.
 */
export function raceEndPopped(
  plan: SwarmPlan,
  existing: Record<number, SwarmTapOutcome>,
  liveOutcome: "claim" | "deny",
): Record<number, SwarmTapOutcome> {
  const next: Record<number, SwarmTapOutcome> = {
    ...existing,
    [plan.liveIndex]: liveOutcome,
  };
  for (const pkg of plan.packages) {
    if (next[pkg.id] == null) next[pkg.id] = "dud";
  }
  return next;
}

/**
 * AI reaction time — wide band so either seat can win the race.
 * Timed against the live pack’s flight so a win still shatters on-screen.
 */
export function aiGrabDelayMs(plan: SwarmPlan, rng: Rng): number {
  const live = plan.packages[plan.liveIndex]!;
  const flight = SWARM_DURATION_MS * live.speed;
  return Math.floor(live.delayMs + flight * (0.12 + rng() * 0.55));
}

/** Mulberry32 — shared tiny PRNG. */
export function createPowerUpRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
