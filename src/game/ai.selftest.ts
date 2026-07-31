/**
 * ponytail: assert-based self-check for AI tactics — run with `npm run check:ai`.
 */
import { findWinningMove, pickAiMove } from "./ai";
import { cellKey, createEmptyBoard } from "./board";
import type { BoardDims, CellCoord } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function testTakesWinningMove() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  // AI ("b") has two on a row; (2,0,0) wins.
  board.set(cellKey(0, 0, 0), "b");
  board.set(cellKey(1, 0, 0), "b");
  board.set(cellKey(0, 1, 0), "a");

  const move = pickAiMove(board, dims, "medium", "b", 3);
  assert(move !== null, "should find a move");
  assert(sameCell(move, { x: 2, y: 0, z: 0 }), "must take open winning cell");
}

function testBlocksOpponentWin() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  // Human ("a") threatens (2,0,0); AI must block.
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(0, 1, 0), "b");

  const move = pickAiMove(board, dims, "hard", "b", 3);
  assert(move !== null, "should find a move");
  assert(sameCell(move, { x: 2, y: 0, z: 0 }), "must block human win");
}

function testFindWinningMoveHelper() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 0, 0), "a");
  const win = findWinningMove(board, dims, "a");
  assert(win !== null && sameCell(win, { x: 3, y: 0, z: 0 }), "helper finds 4-in-a-row win");
}

testTakesWinningMove();
testBlocksOpponentWin();
testFindWinningMoveHelper();
console.log("ai.selftest: ok");
