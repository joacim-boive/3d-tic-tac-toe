import type { BoardDims, CellCoord, PlayerId } from "./types";
import { cellCount, winLength } from "./types";

/** Pack x,y,z into a stable map key. */
export function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function parseCellKey(key: string): CellCoord {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
}

export type Board = Map<string, PlayerId>;

export function createEmptyBoard(): Board {
  return new Map();
}

/**
 * 13 unique line directions in 3D (positive half of the sphere).
 * Axis (3) + face diagonals (6) + space diagonals (4).
 */
export const LINE_DIRECTIONS: readonly CellCoord[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: 1, z: -1 },
  { x: 1, y: 1, z: 1 },
  { x: 1, y: 1, z: -1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: -1, z: -1 },
] as const;

function inBounds(dims: BoardDims, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < dims.x && y < dims.y && z < dims.z;
}

function countAlong(
  board: Board,
  player: PlayerId,
  dims: BoardDims,
  start: CellCoord,
  dir: CellCoord,
): CellCoord[] {
  const cells: CellCoord[] = [];
  let x = start.x + dir.x;
  let y = start.y + dir.y;
  let z = start.z + dir.z;
  while (inBounds(dims, x, y, z) && board.get(cellKey(x, y, z)) === player) {
    cells.push({ x, y, z });
    x += dir.x;
    y += dir.y;
    z += dir.z;
  }
  return cells;
}

export type WinResult = {
  winner: PlayerId;
  line: CellCoord[];
};

/** Check win from the cell just played. Win length = dims.z. */
export function checkWin(
  board: Board,
  dims: BoardDims,
  last: CellCoord,
  player: PlayerId,
): WinResult | null {
  const need = winLength(dims);
  for (const dir of LINE_DIRECTIONS) {
    const forward = countAlong(board, player, dims, last, dir);
    const backward = countAlong(board, player, dims, last, {
      x: -dir.x,
      y: -dir.y,
      z: -dir.z,
    });
    const line = [...backward.reverse(), last, ...forward];
    if (line.length >= need) {
      // Window must include `last` (the completing mark), not just the front of the run.
      const lastIdx = backward.length;
      const start = Math.max(0, Math.min(lastIdx, line.length - need));
      return { winner: player, line: line.slice(start, start + need) };
    }
  }
  return null;
}

export function isDraw(occupiedCount: number, dims: BoardDims): boolean {
  return occupiedCount >= cellCount(dims);
}

/**
 * Scan every occupied cell for a win (after Clear/Tip / repack).
 * Returns the first win found; prefers player `prefer` when both could win.
 */
export function checkWinAny(
  board: Board,
  dims: BoardDims,
  prefer?: PlayerId,
): WinResult | null {
  let other: WinResult | null = null;
  for (const [key, player] of board) {
    const cell = parseCellKey(key);
    const win = checkWin(board, dims, cell, player);
    if (!win) continue;
    if (prefer && win.winner === prefer) return win;
    if (!other) other = win;
  }
  return other;
}

export function listEmptyCells(board: Board, dims: BoardDims): CellCoord[] {
  const empty: CellCoord[] = [];
  for (let x = 0; x < dims.x; x++) {
    for (let y = 0; y < dims.y; y++) {
      for (let z = 0; z < dims.z; z++) {
        if (!board.has(cellKey(x, y, z))) empty.push({ x, y, z });
      }
    }
  }
  return empty;
}

/**
 * Lowest empty cell in column (x, z) for drop/gravity placement.
 * Y is up — pieces stack from y = 0 upward. Null if the column is full.
 */
export function dropLanding(board: Board, dims: BoardDims, x: number, z: number): CellCoord | null {
  if (x < 0 || z < 0 || x >= dims.x || z >= dims.z) return null;
  for (let y = 0; y < dims.y; y++) {
    if (!board.has(cellKey(x, y, z))) return { x, y, z };
  }
  return null;
}

/** One legal drop landing per non-full column. */
export function listDropLandings(board: Board, dims: BoardDims): CellCoord[] {
  const landings: CellCoord[] = [];
  for (let x = 0; x < dims.x; x++) {
    for (let z = 0; z < dims.z; z++) {
      const cell = dropLanding(board, dims, x, z);
      if (cell) landings.push(cell);
    }
  }
  return landings;
}

/**
 * Resolve a requested place into a legal cell.
 * Drop mode uses only (x, z) and returns the gravity landing.
 */
export function resolvePlaceCoord(
  board: Board,
  dims: BoardDims,
  coord: CellCoord,
  placement: "free" | "drop",
): CellCoord | null {
  if (placement === "drop") {
    return dropLanding(board, dims, coord.x, coord.z);
  }
  if (!inBounds(dims, coord.x, coord.y, coord.z)) return null;
  if (board.has(cellKey(coord.x, coord.y, coord.z))) return null;
  return coord;
}

/** True if placing at `coord` (respecting Drop landing) would complete a win. */
export function wouldPlaceWin(
  board: Board,
  dims: BoardDims,
  coord: CellCoord,
  player: PlayerId,
  placement: "free" | "drop",
): boolean {
  const resolved = resolvePlaceCoord(board, dims, coord, placement);
  if (!resolved) return false;
  const next = new Map(board);
  next.set(cellKey(resolved.x, resolved.y, resolved.z), player);
  return checkWin(next, dims, resolved, player) !== null;
}

/** Rejection sampling until density is high, then linear scan. */
export function randomEmptyCell(
  board: Board,
  dims: BoardDims,
  occupiedCount: number,
): CellCoord | null {
  const total = cellCount(dims);
  if (occupiedCount >= total) return null;

  const density = occupiedCount / total;
  if (density < 0.7) {
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = Math.floor(Math.random() * dims.x);
      const y = Math.floor(Math.random() * dims.y);
      const z = Math.floor(Math.random() * dims.z);
      if (!board.has(cellKey(x, y, z))) {
        return { x, y, z };
      }
    }
  }

  const empty = listEmptyCells(board, dims);
  return empty[0] ?? null;
}

/** World position for cell center; board centered at origin. */
export function cellToWorld(
  coord: CellCoord,
  dims: BoardDims,
  spacing = 1,
): [number, number, number] {
  const ox = ((dims.x - 1) * spacing) / 2;
  const oy = ((dims.y - 1) * spacing) / 2;
  const oz = ((dims.z - 1) * spacing) / 2;
  return [coord.x * spacing - ox, coord.y * spacing - oy, coord.z * spacing - oz];
}

/** Snap a world point to nearest cell center; null if outside board padding. */
export function worldToCell(
  wx: number,
  wy: number,
  wz: number,
  dims: BoardDims,
  spacing = 1,
): CellCoord | null {
  const ox = ((dims.x - 1) * spacing) / 2;
  const oy = ((dims.y - 1) * spacing) / 2;
  const oz = ((dims.z - 1) * spacing) / 2;
  const x = Math.round((wx + ox) / spacing);
  const y = Math.round((wy + oy) / spacing);
  const z = Math.round((wz + oz) / spacing);
  if (!inBounds(dims, x, y, z)) return null;
  return { x, y, z };
}
