import {
  clearAxisLine,
  clearBurstDurationMs,
  CLEAR_BURST_LIFE_MS,
  CLEAR_STAGGER_MS,
  occupiedClearLineBalls,
  planClearBurst,
} from "./clearRow";
import { cellKey, createEmptyBoard } from "./board";
import type { BoardDims } from "./types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const dims: BoardDims = { x: 3, y: 3, z: 3 };

{
  const board = createEmptyBoard();
  board.set(cellKey(0, 1, 1), "a");
  board.set(cellKey(1, 1, 1), "b");
  board.set(cellKey(2, 1, 1), "a");
  // Neighbor off the line — must not be included.
  board.set(cellKey(1, 0, 1), "b");

  const occupied = occupiedClearLineBalls(board, dims, "x", 1, 1);
  assert(occupied.length === 3, "three balls on the x-line");
  assert(occupied[0]!.cell.x === 0 && occupied[2]!.cell.x === 2, "ordered along axis");

  const plan = planClearBurst(board, dims, "x", 1, 1);
  assert(plan.length === 3, "plan covers occupied cells");
  assert(plan[0]!.delayMs === 0, "first ball pops immediately");
  assert(plan[1]!.delayMs === CLEAR_STAGGER_MS, "second ball staggered");
  assert(plan[2]!.delayMs === CLEAR_STAGGER_MS * 2, "third ball staggered");
  assert(
    clearBurstDurationMs(3) === CLEAR_STAGGER_MS * 2 + CLEAR_BURST_LIFE_MS,
    "duration covers last confetti",
  );
  assert(clearBurstDurationMs(0) === 0, "empty line has no VFX window");

  const cleared = clearAxisLine(board, dims, "x", 1, 1);
  assert(!cleared.has(cellKey(0, 1, 1)), "line cleared");
  assert(cleared.has(cellKey(1, 0, 1)), "off-line ball kept");
}

console.log("clearRow.selftest: ok");
