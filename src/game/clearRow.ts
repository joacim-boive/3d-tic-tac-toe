import { cellKey, type Board } from "./board";
import type { BoardDims, CellCoord, PlayerId } from "./types";

export type Axis = "x" | "y" | "z";

/** All cells on an axis-aligned line (two coords fixed, one varies). */
export function axisLineCells(
  dims: BoardDims,
  axis: Axis,
  a: number,
  b: number,
): CellCoord[] {
  const cells: CellCoord[] = [];
  if (axis === "x") {
    if (a < 0 || a >= dims.y || b < 0 || b >= dims.z) return cells;
    for (let x = 0; x < dims.x; x++) cells.push({ x, y: a, z: b });
  } else if (axis === "y") {
    if (a < 0 || a >= dims.x || b < 0 || b >= dims.z) return cells;
    for (let y = 0; y < dims.y; y++) cells.push({ x: a, y, z: b });
  } else {
    if (a < 0 || a >= dims.x || b < 0 || b >= dims.y) return cells;
    for (let z = 0; z < dims.z; z++) cells.push({ x: a, y: b, z });
  }
  return cells;
}

/** Delete every marker on the line. */
export function clearAxisLine(
  board: Board,
  dims: BoardDims,
  axis: Axis,
  a: number,
  b: number,
): Board {
  const next = new Map(board);
  for (const cell of axisLineCells(dims, axis, a, b)) {
    next.delete(cellKey(cell.x, cell.y, cell.z));
  }
  return next;
}

/**
 * Compact each (x,z) column toward y=0, preserving bottom-to-top order.
 * Used after Clear in Drop mode (and after Tip settle rebase).
 */
export function repackDrop(board: Board, dims: BoardDims): Board {
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

/** Fixed-pair labels for UI: which two coords are fixed for an axis line. */
export function axisFixedLabels(axis: Axis): [string, string] {
  if (axis === "x") return ["y", "z"];
  if (axis === "y") return ["x", "z"];
  return ["x", "y"];
}

/** Fixed coords for the clear line through `cursor` along `axis`. */
export function clearFixedFromCursor(
  axis: Axis,
  cursor: CellCoord,
): { a: number; b: number } {
  if (axis === "x") return { a: cursor.y, b: cursor.z };
  if (axis === "y") return { a: cursor.x, b: cursor.z };
  return { a: cursor.x, b: cursor.y };
}

export const CLEAR_AXES: readonly Axis[] = ["x", "y", "z"] as const;

export function nextClearAxis(axis: Axis): Axis {
  const i = CLEAR_AXES.indexOf(axis);
  return CLEAR_AXES[(i + 1) % CLEAR_AXES.length]!;
}
