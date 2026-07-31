import { cellKey, type Board } from "./board";
import type { BoardDims, PlayerId } from "./types";

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
      // 180° around X: floor was top
      return { x: p.x, y: m - p.y, z: m - p.z };
    case "-x":
      // Former −X face becomes floor: x → y
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
  if (toDown === "-y") {
    // Same orientation — still repack (no-op if already packed)
    return packTowardFloor(board, dims);
  }

  const n = dims.x;
  type Entry = { x: number; y: number; z: number; player: PlayerId; key: string };
  const rotated: Entry[] = [];
  for (const [key, player] of board) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    const r = rotateToNegY({ x, y, z }, toDown, n);
    rotated.push({ ...r, player, key });
  }

  // Group by column (x,z); sort by y ascending (fall toward 0); pack.
  const columns = new Map<string, Entry[]>();
  for (const e of rotated) {
    const ck = `${e.x},${e.z}`;
    const list = columns.get(ck) ?? [];
    list.push(e);
    columns.set(ck, list);
  }

  const next: Board = new Map();
  for (const [, list] of columns) {
    list.sort((a, b) => a.y - b.y || a.key.localeCompare(b.key));
    list.forEach((e, y) => {
      if (y >= n) return;
      // Clamp x,z into bounds (rotation keeps them in-range for cubes)
      const x = Math.max(0, Math.min(n - 1, e.x));
      const z = Math.max(0, Math.min(n - 1, e.z));
      next.set(cellKey(x, y, z), e.player);
    });
  }
  return next;
}

function packTowardFloor(board: Board, dims: BoardDims): Board {
  const next: Board = new Map();
  for (let x = 0; x < dims.x; x++) {
    for (let z = 0; z < dims.z; z++) {
      const stack: PlayerId[] = [];
      for (let y = 0; y < dims.y; y++) {
        const owner = board.get(cellKey(x, y, z));
        if (owner) stack.push(owner);
      }
      for (let y = 0; y < stack.length; y++) {
        next.set(cellKey(x, y, z), stack[y]!);
      }
    }
  }
  return next;
}

/** Legal tip directions excluding current floor (−y). */
export function tipChoices(): TipDown[] {
  return TIP_DOWNS.filter((d) => d !== "-y");
}
