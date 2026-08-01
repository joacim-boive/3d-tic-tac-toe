import { cellKey, type Board } from "./board";
import type { BoardDims, CellCoord, PlayerId } from "./types";

/**
 * Which face becomes the new floor (gravity pulls toward this axis end).
 * Cell space: y=0 is the current floor (−y).
 */
export type TipDown = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export const TIP_DOWNS: readonly TipDown[] = [
  "+x",
  "-x",
  "+y",
  "-y",
  "+z",
  "-z",
] as const;

/** Euler XYZ in radians — always kept on 90° increments when idle. */
export type TipEuler = { x: number; y: number; z: number };

export const IDENTITY_TIP_EULER: TipEuler = { x: 0, y: 0, z: 0 };

export function isCubeDims(dims: BoardDims): boolean {
  return dims.x === dims.y && dims.y === dims.z;
}

/** Tip is enabled only on cube presets (see power-ups design). */
export function canTipPreset(dims: BoardDims): boolean {
  return isCubeDims(dims);
}

/**
 * Apply a snapped tip Euler (Three.js order 'XYZ') to a cell index.
 * Matches `Vector3.applyQuaternion(quat.setFromEuler(XYZ))` / fall visual starts.
 */
export function cellThroughTipEuler(p: CellCoord, euler: TipEuler, n: number): CellCoord {
  const mid = (n - 1) / 2;
  const x = p.x - mid;
  const y = p.y - mid;
  const z = p.z - mid;

  // Same matrix as THREE.Matrix4.makeRotationFromEuler(order 'XYZ'):
  // a=cos(x) b=sin(x) c=cos(y) d=sin(y) e=cos(z) f=sin(z)
  const a = Math.cos(euler.x);
  const b = Math.sin(euler.x);
  const c = Math.cos(euler.y);
  const d = Math.sin(euler.y);
  const e = Math.cos(euler.z);
  const f = Math.sin(euler.z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;

  const x1 = c * e * x + -c * f * y + d * z;
  const y1 = (af + be * d) * x + (ae - bf * d) * y + -b * c * z;
  const z1 = (bf - ae * d) * x + (be + af * d) * y + a * c * z;

  return {
    x: Math.round(x1 + mid),
    y: Math.round(y1 + mid),
    z: Math.round(z1 + mid),
  };
}

export type TipRemapEntry = {
  from: CellCoord;
  to: CellCoord;
  player: PlayerId;
  key: string;
};

function packRotatedEntries(
  rotated: Array<{ x: number; y: number; z: number; player: PlayerId; key: string; from: CellCoord }>,
  n: number,
): TipRemapEntry[] {
  const columns = new Map<string, typeof rotated>();
  for (const e of rotated) {
    const ck = `${e.x},${e.z}`;
    const list = columns.get(ck) ?? [];
    list.push(e);
    columns.set(ck, list);
  }

  const out: TipRemapEntry[] = [];
  for (const [, list] of columns) {
    list.sort((a, b) => a.y - b.y || a.key.localeCompare(b.key));
    list.forEach((e, y) => {
      if (y >= n) return;
      const x = Math.max(0, Math.min(n - 1, e.x));
      const z = Math.max(0, Math.min(n - 1, e.z));
      out.push({ from: e.from, to: { x, y, z }, player: e.player, key: e.key });
    });
  }
  return out;
}

/**
 * Reorient the cube so `toDown` becomes −Y (canonical spin), then pack to y=0.
 * Uses the same Three.js XYZ path as a player tip with `eulerForTipDown`.
 * Prefer `tipBoardFromEuler` when the tip includes yaw.
 */
export function tipBoard(board: Board, dims: BoardDims, toDown: TipDown): Board {
  return tipBoardFromEuler(board, dims, eulerForTipDown(toDown));
}

/** Full tip orientation (face + yaw) → new board. */
export function tipBoardFromEuler(board: Board, dims: BoardDims, euler: TipEuler): Board {
  if (!isCubeDims(dims)) {
    throw new Error("tipBoardFromEuler requires cube dims");
  }
  const remapped = tipRemapFromEuler(board, dims, euler);
  const next: Board = new Map();
  for (const e of remapped) {
    next.set(cellKey(e.to.x, e.to.y, e.to.z), e.player);
  }
  return next;
}

/** Stable from→to mapping for a face tip (canonical spin via `eulerForTipDown`). */
export function tipRemap(board: Board, dims: BoardDims, toDown: TipDown): TipRemapEntry[] {
  return tipRemapFromEuler(board, dims, eulerForTipDown(toDown));
}

/**
 * Remap through the full tip Euler (includes spin-on-bottom yaw).
 * Matches the visual `R * cellToWorld(from)` → upright cell after identity snap.
 */
export function tipRemapFromEuler(
  board: Board,
  dims: BoardDims,
  euler: TipEuler,
): TipRemapEntry[] {
  if (!isCubeDims(dims)) {
    throw new Error("tipRemapFromEuler requires cube dims");
  }
  const n = dims.x;
  const snapped = snapTipEuler(euler);
  const rotated: Array<{
    x: number;
    y: number;
    z: number;
    player: PlayerId;
    key: string;
    from: CellCoord;
  }> = [];
  for (const [key, player] of board) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    const from = { x, y, z };
    const r = cellThroughTipEuler(from, snapped, n);
    rotated.push({
      x: Math.max(0, Math.min(n - 1, r.x)),
      y: Math.max(0, Math.min(n - 1, r.y)),
      z: Math.max(0, Math.min(n - 1, r.z)),
      player,
      key,
      from,
    });
  }
  return packRotatedEntries(rotated, n);
}

/**
 * Which local face is currently pointing most toward world −Y,
 * given an XYZ Euler rotation applied to the board group.
 */
export function tipDownFromEuler(euler: TipEuler): TipDown {
  // Columns of THREE.Matrix4.makeRotationFromEuler(order 'XYZ').
  const a = Math.cos(euler.x);
  const b = Math.sin(euler.x);
  const c = Math.cos(euler.y);
  const d = Math.sin(euler.y);
  const e = Math.cos(euler.z);
  const f = Math.sin(euler.z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;

  const xAxisY = af + be * d;
  const yAxisY = ae - bf * d;
  const zAxisY = -b * c;

  // Score: how much each local −axis aligns with world down (0,-1,0).
  const scores: Array<{ id: TipDown; score: number }> = [
    { id: "-x", score: xAxisY },
    { id: "+x", score: -xAxisY },
    { id: "-y", score: yAxisY },
    { id: "+y", score: -yAxisY },
    { id: "-z", score: zAxisY },
    { id: "+z", score: -zAxisY },
  ];
  scores.sort((a, b) => b.score - a.score);
  return scores[0]!.id;
}

const HALF_PI = Math.PI / 2;

/** Snap each component to the nearest 90°. */
export function snapTipEuler(euler: TipEuler): TipEuler {
  return {
    x: Math.round(euler.x / HALF_PI) * HALF_PI,
    y: Math.round(euler.y / HALF_PI) * HALF_PI,
    z: Math.round(euler.z / HALF_PI) * HALF_PI,
  };
}

/** Apply one 90° tip around world X or Z (legacy helper / tests). */
export function tipEulerByDrag(euler: TipEuler, axis: "x" | "z", dir: 1 | -1): TipEuler {
  const snapped = snapTipEuler(euler);
  if (axis === "x") {
    return snapTipEuler({ ...snapped, x: snapped.x + dir * HALF_PI });
  }
  return snapTipEuler({ ...snapped, z: snapped.z + dir * HALF_PI });
}

/** Euler that makes `toDown` align with world −Y (for AI instant tip). */
export function eulerForTipDown(toDown: TipDown): TipEuler {
  switch (toDown) {
    case "-y":
      return { x: 0, y: 0, z: 0 };
    case "+y":
      return { x: Math.PI, y: 0, z: 0 };
    case "-x":
      return { x: 0, y: 0, z: HALF_PI };
    case "+x":
      return { x: 0, y: 0, z: -HALF_PI };
    case "-z":
      return { x: -HALF_PI, y: 0, z: 0 };
    case "+z":
      return { x: HALF_PI, y: 0, z: 0 };
  }
}

/** Legal tip directions excluding current floor (−y). */
export function tipChoices(): TipDown[] {
  return TIP_DOWNS.filter((d) => d !== "-y");
}
