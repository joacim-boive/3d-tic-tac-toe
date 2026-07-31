import type { PlayerId } from "./types";

export type PowerUpId = "extra-turn" | "clear-row" | "tip";

export const POWER_UP_IDS: readonly PowerUpId[] = [
  "extra-turn",
  "clear-row",
  "tip",
] as const;

export const POWER_UP_LABELS: Record<PowerUpId, string> = {
  "extra-turn": "Extra turn",
  "clear-row": "Clear row",
  tip: "Tip field",
};

export const MAX_PER_KIND = 2;
export const SWARM_PACKAGE_COUNT = 3;
/** Earliest ply (occupiedCount) that may trigger a package swarm. */
export const SWARM_MIN_PLY = 3;
/** Chance to fire a swarm after a place once ply gate passes. */
export const SWARM_CHANCE = 0.55;
/** AI catch success rate (≈ one of three packages live). */
export const AI_CATCH_CHANCE = 1 / 3;
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
  earner: PlayerId;
  packages: SwarmPackagePlan[];
  /** Human watches only (AI earner) — no tap catch. */
  watchOnly?: boolean;
};

export type Rng = () => number;

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

export function underCapKinds(counts: PowerUpCounts): PowerUpId[] {
  return POWER_UP_IDS.filter((id) => counts[id] < MAX_PER_KIND);
}

export function hasInventoryRoom(counts: PowerUpCounts): boolean {
  return underCapKinds(counts).length > 0;
}

export function canSpend(counts: PowerUpCounts, kind: PowerUpId): boolean {
  return counts[kind] > 0;
}

/** Increment kind if under cap; returns new counts or null if full. */
export function awardPowerUp(counts: PowerUpCounts, kind: PowerUpId): PowerUpCounts | null {
  if (counts[kind] >= MAX_PER_KIND) return null;
  return { ...counts, [kind]: counts[kind] + 1 };
}

export function spendPowerUp(counts: PowerUpCounts, kind: PowerUpId): PowerUpCounts | null {
  if (counts[kind] <= 0) return null;
  return { ...counts, [kind]: counts[kind] - 1 };
}

export function pickRandomKind(counts: PowerUpCounts, rng: Rng): PowerUpId | null {
  const open = underCapKinds(counts);
  if (open.length === 0) return null;
  return open[Math.floor(rng() * open.length)]!;
}

/** Should a swarm attempt fire after this place? */
export function shouldAttemptSwarm(opts: {
  powerUpsEnabled: boolean;
  occupiedCount: number;
  earnerCounts: PowerUpCounts;
  rng: Rng;
}): boolean {
  if (!opts.powerUpsEnabled) return false;
  if (opts.occupiedCount < SWARM_MIN_PLY) return false;
  if (!hasInventoryRoom(opts.earnerCounts)) return false;
  return opts.rng() < SWARM_CHANCE;
}

function edgePoint(rng: Rng, edge: 0 | 1 | 2 | 3): { x: number; y: number } {
  const t = rng();
  switch (edge) {
    case 0:
      return { x: t, y: -0.08 };
    case 1:
      return { x: 1.08, y: t };
    case 2:
      return { x: t, y: 1.08 };
    default:
      return { x: -0.08, y: t };
  }
}

/** Build deterministic flyby paths from a seed. */
export function planSwarm(seed: number, earner: PlayerId, rng: Rng): SwarmPlan {
  const liveIndex = Math.floor(rng() * SWARM_PACKAGE_COUNT) as 0 | 1 | 2;
  const packages: SwarmPackagePlan[] = [];
  for (let i = 0; i < SWARM_PACKAGE_COUNT; i++) {
    const startEdge = Math.floor(rng() * 4) as 0 | 1 | 2 | 3;
    let endEdge = Math.floor(rng() * 4) as 0 | 1 | 2 | 3;
    if (endEdge === startEdge) endEdge = ((startEdge + 2) % 4) as 0 | 1 | 2 | 3;
    const start = edgePoint(rng, startEdge);
    const end = edgePoint(rng, endEdge);
    packages.push({
      id: i,
      x0: start.x,
      y0: start.y,
      x1: end.x,
      y1: end.y,
      speed: 0.85 + rng() * 0.3,
      delayMs: Math.floor(rng() * 180),
    });
  }
  return { seed, liveIndex, earner, packages };
}

export function aiCatchRoll(rng: Rng): boolean {
  return rng() < AI_CATCH_CHANCE;
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
