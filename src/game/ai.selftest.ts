/**
 * ponytail: assert-based self-check for AI tactics — run with `npm run check:ai`.
 */
import { findWinningMove, isExtremeAllowed, pickAiMove } from "./ai";
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

/**
 * 4×4×4 fork: b at (0,0,0)(1,0,0)(2,1,0)(2,2,0).
 * Playing (2,0,0) creates threats at both (3,0,0) and (2,3,0).
 */
function testTakesForkOnLargerBoard() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "b");
  board.set(cellKey(1, 0, 0), "b");
  board.set(cellKey(2, 1, 0), "b");
  board.set(cellKey(2, 2, 0), "b");
  board.set(cellKey(3, 3, 3), "a");
  board.set(cellKey(3, 3, 2), "a");
  board.set(cellKey(3, 2, 3), "a");

  for (const difficulty of ["hard", "extreme"] as const) {
    const move = pickAiMove(board, dims, difficulty, "b", 7, "free", {
      budgetMs: Number.POSITIVE_INFINITY,
      maxDepth: 2,
    });
    assert(move !== null, `${difficulty} should find a move`);
    assert(
      sameCell(move, { x: 2, y: 0, z: 0 }),
      `${difficulty} must take fork at (2,0,0), got (${move.x},${move.y},${move.z})`,
    );
  }
}

function testBlocksOpponentFork() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 1, 0), "a");
  board.set(cellKey(2, 2, 0), "a");
  board.set(cellKey(3, 3, 3), "b");
  board.set(cellKey(3, 3, 2), "b");
  board.set(cellKey(3, 2, 3), "b");

  const move = pickAiMove(board, dims, "extreme", "b", 7, "free", {
    budgetMs: Number.POSITIVE_INFINITY,
    maxDepth: 2,
  });
  assert(move !== null, "should find a move");
  assert(sameCell(move, { x: 2, y: 0, z: 0 }), "must block human fork");
}

function testExtremeAllowedPresets() {
  assert(!isExtremeAllowed("3x3x3"), "no Extreme on 3×3×3");
  assert(isExtremeAllowed("4x4x4"), "Extreme on 4×4×4");
  assert(isExtremeAllowed("5x5x4"), "Extreme on 5×5×4");
}

testTakesWinningMove();
testBlocksOpponentWin();
testFindWinningMoveHelper();
testTakesForkOnLargerBoard();
testBlocksOpponentFork();
testExtremeAllowedPresets();
console.log("ai.selftest: ok");
