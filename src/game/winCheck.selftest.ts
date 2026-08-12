/**
 * ponytail: assert-based self-check for 3D win lines — run with `npm run check:win`.
 */
import { cellKey, checkWin, createEmptyBoard, LINE_DIRECTIONS, wouldPlaceWin, type Board } from "./board";
import type { BoardDims, CellCoord, PlayerId } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function placeLine(board: Board, player: PlayerId, cells: CellCoord[]) {
  for (const c of cells) {
    board.set(cellKey(c.x, c.y, c.z), player);
  }
}

function testAxisWin() {
  // 4×4×4 → win length 4 along X
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  placeLine(board, "a", [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
  ]);
  board.set(cellKey(3, 0, 0), "a");
  const win = checkWin(board, dims, { x: 3, y: 0, z: 0 }, "a");
  assert(win !== null, "axis win should detect 4 in a row");
  assert(win.line.length === 4, "winning line length");
}

function testSpaceDiagonal() {
  // 3×3×3 → win length 3 on space diagonal
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  placeLine(board, "b", [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 1, z: 1 },
  ]);
  board.set(cellKey(2, 2, 2), "b");
  const win = checkWin(board, dims, { x: 2, y: 2, z: 2 }, "b");
  assert(win !== null, "space diagonal win");
  assert(win.winner === "b", "winner is b");
}

function testNoFalseWin() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 0, 0), "a");
  board.set(cellKey(3, 0, 0), "b");
  const win = checkWin(board, dims, { x: 2, y: 0, z: 0 }, "a");
  assert(win === null, "broken line must not win");
}

function testWinLengthIsZ() {
  // On 5×5×4, three in a row is not enough (win length defaults to Z)
  const dims: BoardDims = { x: 5, y: 5, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 0, 0), "a");
  const win = checkWin(board, dims, { x: 2, y: 0, z: 0 }, "a");
  assert(win === null, "3 < Z=4 must not win");
}

function testFlatClassicWin() {
  // Classic 7×6: one cell deep, win length overridden via w=4
  const dims: BoardDims = { x: 7, y: 6, z: 1, w: 4 };
  const board = createEmptyBoard();
  placeLine(board, "a", [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 2, y: 2, z: 0 },
  ]);
  board.set(cellKey(3, 3, 0), "a");
  const win = checkWin(board, dims, { x: 3, y: 3, z: 0 }, "a");
  assert(win !== null, "flat diagonal should win with w=4");
  assert(win.line.length === 4, "classic line length");
}

function testFlatNeedsExplicitWinLength() {
  // Without w, win length would be z=1 — a single cell "wins"
  const dims: BoardDims = { x: 7, y: 6, z: 1 };
  const board = createEmptyBoard();
  board.set(cellKey(3, 2, 0), "a");
  const win = checkWin(board, dims, { x: 3, y: 2, z: 0 }, "a");
  assert(win !== null, "z=1 without w means need=1");
  assert(win.line.length === 1, "single-cell win when need=1");
}

function testFlatThreeIsNotEnough() {
  const dims: BoardDims = { x: 7, y: 6, z: 1, w: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 0, 0), "a");
  const win = checkWin(board, dims, { x: 2, y: 0, z: 0 }, "a");
  assert(win === null, "3 < w=4 must not win on flat board");
}

function testDirectionCount() {
  assert(LINE_DIRECTIONS.length === 13, "expected 13 unique 3D directions");
}

function testWouldPlaceWin() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 0, 0), "a");
  assert(
    wouldPlaceWin(board, dims, { x: 3, y: 0, z: 0 }, "a", "free"),
    "fourth cell finishes the line",
  );
  assert(
    !wouldPlaceWin(board, dims, { x: 0, y: 1, z: 0 }, "a", "free"),
    "off-line cell does not finish",
  );
}

testAxisWin();
testSpaceDiagonal();
testNoFalseWin();
testWinLengthIsZ();
testFlatClassicWin();
testFlatNeedsExplicitWinLength();
testFlatThreeIsNotEnough();
testDirectionCount();
testWouldPlaceWin();
console.log("winCheck.selftest: ok");
