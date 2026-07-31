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

type Vec3 = { x: number; y: number; z: number };

function rotateToNegY(p: Vec3, toDown: TipDown, n: number): Vec3 {
  const m = n - 1;
  switch (toDown) {
    case "-y":
      return p;
    case "+y":
      return { x: p.x, y: m - p.y, z: m - p.z };
    case "-x":
      return { x: p.y, y: p.x, z: p.z };
    case "+x":
      return { x: p.y, y: m - p.x, z: p.z };
    case "-z":
      return { x: p.x, y: p.z, z: m - p.y };
    case "+z":
      return { x: p.x, y: m - p.z, z: p.y };
  }
}

/**
 * Reorient the cube so `toDown` becomes −Y, then pack columns to y=0.
 * Cube-only. Deterministic; stable sort by pre-pack height then key.
 */
export function tipBoard(board: Board, dims: BoardDims, toDown: TipDown): Board {
  if (!isCubeDims(dims)) {
    throw new Error("tipBoard requires cube dims");
  }
  const remapped = tipRemap(board, dims, toDown);
  const next: Board = new Map();
  for (const e of remapped) {
    next.set(cellKey(e.to.x, e.to.y, e.to.z), e.player);
  }
  return next;
}

export type TipRemapEntry = {
  from: CellCoord;
  to: CellCoord;
  player: PlayerId;
  key: string;
};

/** Stable from→to mapping used for fall animation. */
export function tipRemap(board: Board, dims: BoardDims, toDown: TipDown): TipRemapEntry[] {
  if (!isCubeDims(dims)) {
    throw new Error("tipRemap requires cube dims");
  }
  const n = dims.x;
  type Entry = {
    x: number;
    y: number;
    z: number;
    player: PlayerId;
    key: string;
    from: CellCoord;
  };
  const rotated: Entry[] = [];
  for (const [key, player] of board) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    const from = { x, y, z };
    const r = rotateToNegY(from, toDown, n);
    rotated.push({ ...r, player, key, from });
  }

  const columns = new Map<string, Entry[]>();
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
 * Which local face is currently pointing most toward world −Y,
 * given an XYZ Euler rotation applied to the board group.
 */
export function tipDownFromEuler(euler: TipEuler): TipDown {
  const cx = Math.cos(euler.x);
  const sx = Math.sin(euler.x);
  const cy = Math.cos(euler.y);
  const sy = Math.sin(euler.y);
  const cz = Math.cos(euler.z);
  const sz = Math.sin(euler.z);

  // Columns of R = Rz * Ry * Rx (Three.js default Euler 'XYZ' intrinsic = extrinsic ZYX…
  // Three.js Object3D with order 'XYZ' applies R = Rx * Ry * Rz in local terms differently.
  // We use the same as THREE.Euler order 'XYZ': R = Rz * Ry * Rx applied to column vectors.
  // Basis vectors (local axes in world):
  const xAxis = {
    x: cy * cz,
    y: sx * sy * cz + cx * sz,
    z: -cx * sy * cz + sx * sz,
  };
  const yAxis = {
    x: -cy * sz,
    y: -sx * sy * sz + cx * cz,
    z: cx * sy * sz + sx * cz,
  };
  const zAxis = {
    x: sy,
    y: -sx * cy,
    z: cx * cy,
  };

  // Score: how much each local −axis aligns with world down (0,-1,0).
  const scores: Array<{ id: TipDown; score: number }> = [
    { id: "-x", score: xAxis.y },
    { id: "+x", score: -xAxis.y },
    { id: "-y", score: yAxis.y },
    { id: "+y", score: -yAxis.y },
    { id: "-z", score: zAxis.y },
    { id: "+z", score: -zAxis.y },
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

/** Apply one 90° tip around world X or Z (push the box onto its side). */
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
