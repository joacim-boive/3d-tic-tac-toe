/**
 * Assert-based self-check for drop/gravity placement — run with `npm run check:drop`.
 */
import {
  cellKey,
  createEmptyBoard,
  dropLanding,
  listDropLandings,
  resolvePlaceCoord,
} from "./board";
import type { BoardDims, CellCoord } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function testEmptyColumnLandsOnFloor() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  const land = dropLanding(board, dims, 1, 2);
  assert(land !== null && sameCell(land, { x: 1, y: 0, z: 2 }), "empty column → y=0");
}

function testStacksAboveOccupied() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(0, 1, 0), "b");
  const land = dropLanding(board, dims, 0, 0);
  assert(land !== null && sameCell(land, { x: 0, y: 2, z: 0 }), "stacks on top of two pieces");
}

function testFullColumn() {
  const dims: BoardDims = { x: 2, y: 2, z: 2 };
  const board = createEmptyBoard();
  board.set(cellKey(1, 0, 1), "a");
  board.set(cellKey(1, 1, 1), "b");
  assert(dropLanding(board, dims, 1, 1) === null, "full column → null");
}

function testListDropLandings() {
  const dims: BoardDims = { x: 2, y: 2, z: 2 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  const lands = listDropLandings(board, dims);
  assert(lands.length === 4, "2×2 columns → 4 landings");
  const stacked = lands.find((c) => c.x === 0 && c.z === 0);
  assert(stacked !== undefined && stacked.y === 1, "occupied column lands at y=1");
}

function testResolvePlaceDropIgnoresY() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  board.set(cellKey(2, 0, 1), "a");
  const resolved = resolvePlaceCoord(board, dims, { x: 2, y: 2, z: 1 }, "drop");
  assert(resolved !== null && sameCell(resolved, { x: 2, y: 1, z: 1 }), "drop ignores requested y");
}

function testResolvePlaceFree() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  board.set(cellKey(1, 1, 1), "a");
  assert(resolvePlaceCoord(board, dims, { x: 1, y: 1, z: 1 }, "free") === null, "occupied rejected");
  const ok = resolvePlaceCoord(board, dims, { x: 0, y: 2, z: 0 }, "free");
  assert(ok !== null && sameCell(ok, { x: 0, y: 2, z: 0 }), "free keeps requested cell");
}

testEmptyColumnLandsOnFloor();
testStacksAboveOccupied();
testFullColumn();
testListDropLandings();
testResolvePlaceDropIgnoresY();
testResolvePlaceFree();
console.log("drop.selftest: ok");
