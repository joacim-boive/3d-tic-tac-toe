/**
 * ponytail: assert-based self-check for AI tactics — run with `npm run check:ai`.
 */
import { bestQuietMove, findTwoPlyForceMove, findWinningMove, isExtremeAllowed, pickAiMove } from "./ai";
import { pickAiPowerUpSpend } from "./aiPowerUps";
import { cellKey, createEmptyBoard, listEmptyCells } from "./board";
import type { BoardDims, CellCoord } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function isNearCenter(cell: CellCoord, dims: BoardDims, placement: "free" | "drop"): boolean {
  const cx = (dims.x - 1) / 2;
  const cz = (dims.z - 1) / 2;
  if (placement === "drop") {
    assert(cell.y === 0, "drop opening must be on the floor");
    // Prefer the central floor band — not a corner column.
    const cornerX = cell.x === 0 || cell.x === dims.x - 1;
    const cornerZ = cell.z === 0 || cell.z === dims.z - 1;
    return !(cornerX && cornerZ) && Math.abs(cell.x - cx) <= 1.1 && Math.abs(cell.z - cz) <= 1.1;
  }
  const cy = (dims.y - 1) / 2;
  return (
    Math.abs(cell.x - cx) <= 1.1 && Math.abs(cell.y - cy) <= 1.1 && Math.abs(cell.z - cz) <= 1.1
  );
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

/**
 * Force-then-fork: after (0,2,0) creates a single threat, the forced block still
 * leaves a fork. Medium/Hard miss the defensive occupy; Extreme must take it
 * even with a tiny search budget (forced tactics, not α-β).
 */
function testBlocksTwoPlyForce() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(0, 1, 0), "a");
  board.set(cellKey(1, 1, 0), "a");
  board.set(cellKey(2, 2, 0), "a");
  board.set(cellKey(3, 3, 0), "b");
  board.set(cellKey(3, 3, 3), "b");
  board.set(cellKey(3, 2, 3), "b");
  board.set(cellKey(2, 3, 3), "b");

  const force = findTwoPlyForceMove(board, dims, "a", listEmptyCells(board, dims), "free");
  assert(force !== null, "fixture must contain a two-ply force");
  assert(sameCell(force, { x: 0, y: 2, z: 0 }), "expected force cell");

  const extreme = pickAiMove(board, dims, "extreme", "b", board.size, "free", {
    budgetMs: 1,
    maxDepth: 1,
    rng: () => 0,
  });
  assert(extreme !== null, "extreme should move");
  assert(
    sameCell(extreme, { x: 0, y: 2, z: 0 }),
    `extreme must occupy the force cell, got (${extreme.x},${extreme.y},${extreme.z})`,
  );

  for (const difficulty of ["medium", "hard"] as const) {
    const move = pickAiMove(board, dims, difficulty, "b", board.size, "free", {
      budgetMs: 1,
      maxDepth: 1,
      rng: () => 0,
    });
    assert(move !== null, `${difficulty} should move`);
    assert(
      !sameCell(move, { x: 0, y: 2, z: 0 }),
      `${difficulty} is not required to see two-ply forces (ladder check)`,
    );
  }
}

function testTakesTwoPlyForce() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "b");
  board.set(cellKey(1, 0, 0), "b");
  board.set(cellKey(0, 1, 0), "b");
  board.set(cellKey(1, 1, 0), "b");
  board.set(cellKey(2, 2, 0), "b");
  board.set(cellKey(3, 3, 0), "a");
  board.set(cellKey(3, 3, 3), "a");
  board.set(cellKey(3, 2, 3), "a");
  board.set(cellKey(2, 3, 3), "a");

  const move = pickAiMove(board, dims, "extreme", "b", board.size, "free", {
    budgetMs: 1,
    maxDepth: 1,
    rng: () => 0,
  });
  assert(move !== null, "should find a move");
  assert(sameCell(move, { x: 0, y: 2, z: 0 }), "must play the force-then-fork");
}

/**
 * After a bait cell, human would have a force-then-fork. Extreme must not play the bait
 * even if shallow search likes it — the root safety filter should refuse.
 */
function testExtremeAvoidsHandingForce() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  // Same shape as the two-ply fixture, but AI to move and must not "pass" by playing junk
  // that leaves the force cell open — any move other than occupying (0,2,0) may be unsafe.
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(0, 1, 0), "a");
  board.set(cellKey(1, 1, 0), "a");
  board.set(cellKey(2, 2, 0), "a");
  board.set(cellKey(3, 3, 0), "b");
  board.set(cellKey(3, 3, 3), "b");
  board.set(cellKey(3, 2, 3), "b");
  board.set(cellKey(2, 3, 3), "b");

  const move = pickAiMove(board, dims, "extreme", "b", board.size, "free", {
    budgetMs: Number.POSITIVE_INFINITY,
    maxDepth: 3,
    rng: () => 0,
  });
  assert(move !== null, "extreme should move");
  assert(
    sameCell(move, { x: 0, y: 2, z: 0 }),
    `extreme must spoil the force, got (${move.x},${move.y},${move.z})`,
  );
}

function testExtremeAllowedPresets() {
  assert(!isExtremeAllowed("3x3x3"), "no Extreme on 3×3×3");
  assert(isExtremeAllowed("4x4x4"), "Extreme on 4×4×4");
  assert(isExtremeAllowed("5x5x4"), "Extreme on 5×5×4");
}

function testDropOpeningPrefersCenter() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();

  for (const difficulty of ["medium", "hard", "extreme"] as const) {
    const move = pickAiMove(board, dims, difficulty, "b", 0, "drop", {
      budgetMs: Number.POSITIVE_INFINITY,
      maxDepth: 2,
      rng: () => 0,
    });
    assert(move !== null, `${difficulty} drop opening`);
    assert(
      isNearCenter(move, dims, "drop"),
      `${difficulty} drop opening must not be a floor corner, got (${move.x},${move.y},${move.z})`,
    );
  }
}

function testFreeOpeningPrefersCenter() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  const move = bestQuietMove(
    board,
    dims,
    "b",
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 3, y: 3, z: 3 },
    ],
    "free",
  );
  assert(move !== null && sameCell(move, { x: 1, y: 1, z: 1 }), "quiet pick prefers center");
}

function testClearIgnoresEmptyAndOwnOnlyLines() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "b");
  board.set(cellKey(1, 0, 0), "b");
  board.set(cellKey(2, 1, 1), "a");

  const decision = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 0, "clear-row": 1, tip: 0 },
    placement: "free",
    difficulty: "extreme",
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    presetId: "3x3x3",
  });

  // If Clear fires, the chosen line must include an opponent mark.
  if (decision.action === "clear-row") {
    const { axis, a, b } = decision;
    let theirs = 0;
    if (axis === "x") {
      for (let x = 0; x < dims.x; x++) {
        if (board.get(cellKey(x, a, b)) === "a") theirs++;
      }
    } else if (axis === "y") {
      for (let y = 0; y < dims.y; y++) {
        if (board.get(cellKey(a, y, b)) === "a") theirs++;
      }
    } else {
      for (let z = 0; z < dims.z; z++) {
        if (board.get(cellKey(a, b, z)) === "a") theirs++;
      }
    }
    assert(theirs > 0, "clear must hit at least one opponent mark");
  }
}

function testClearBreaksOpponentForkThreat() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  // Single open threat — blockable by place, so Clear should stay banked.
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 0, 0), "a");
  board.set(cellKey(0, 1, 1), "b");
  board.set(cellKey(1, 1, 1), "b");

  const decision = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 0, "clear-row": 1, tip: 0 },
    placement: "free",
    difficulty: "extreme",
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    presetId: "4x4x4",
  });

  assert(decision.action === "none", "single blockable threat → place, don't clear");
}

function testClearUsedOnOpponentFork() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  // Human fork at (2,0,0): two winning replies if AI only places once.
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "a");
  board.set(cellKey(2, 1, 0), "a");
  board.set(cellKey(2, 2, 0), "a");
  board.set(cellKey(3, 3, 3), "b");
  board.set(cellKey(3, 3, 2), "b");
  board.set(cellKey(3, 2, 3), "b");

  const decision = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 0, "clear-row": 1, tip: 0 },
    placement: "free",
    difficulty: "extreme",
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    presetId: "4x4x4",
  });

  assert(decision.action === "clear-row", "clear to break an unstoppable fork");
}

function testExtraTurnWhenDoublePlaceWins() {
  // Use 4×4×4 — Extra is banned on 3×3×3.
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  // Only finishing Extra cells available — must not spend Extra to clinch.
  board.set(cellKey(0, 0, 0), "b");
  board.set(cellKey(1, 0, 0), "b");
  board.set(cellKey(2, 0, 0), "b");
  board.set(cellKey(0, 1, 0), "a");
  board.set(cellKey(1, 1, 0), "a");
  board.set(cellKey(2, 1, 0), "a");

  const beforePlace = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 1, "clear-row": 0, tip: 0 },
    placement: "free",
    difficulty: "hard",
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    presetId: "4x4x4",
  });
  assert(beforePlace.action === "none", "Extra cannot activate before the ordinary place");

  const afterPlace = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 1, "clear-row": 0, tip: 0 },
    placement: "free",
    difficulty: "hard",
    bonusPlacesRemaining: 0,
    placedThisTurn: true,
    presetId: "4x4x4",
  });
  assert(
    afterPlace.action === "none",
    "Extra is not spent only to finish a line (bonus can't clinch)",
  );
}

function testExtraTurnForForkAfterPlace() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  // Extra at (2,2,0) is not a win, but creates two win-in-1 replies:
  // (3,2,0) on the y=2 row and (2,3,0) on the x=2 column.
  board.set(cellKey(0, 2, 0), "b");
  board.set(cellKey(1, 2, 0), "b");
  board.set(cellKey(2, 0, 0), "b");
  board.set(cellKey(2, 1, 0), "b");
  board.set(cellKey(3, 3, 3), "a");
  board.set(cellKey(3, 3, 2), "a");
  board.set(cellKey(3, 2, 3), "a");

  const decision = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 1, "clear-row": 0, tip: 0 },
    placement: "free",
    difficulty: "hard",
    bonusPlacesRemaining: 0,
    placedThisTurn: true,
    presetId: "4x4x4",
  });
  assert(decision.action === "extra-turn", "use Extra after place to plant a fork");
}

function testExtraTurnBannedOn3x3x3() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "b");
  board.set(cellKey(0, 1, 0), "a");
  board.set(cellKey(1, 1, 0), "a");

  const decision = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 1, "clear-row": 0, tip: 0 },
    placement: "free",
    difficulty: "hard",
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    presetId: "3x3x3",
  });

  assert(decision.action === "none", "Extra turn disabled on 3×3×3");
}

function testNoClearOnEmptyBoard() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const board = createEmptyBoard();
  const decision = pickAiPowerUpSpend({
    board,
    dims,
    aiPlayer: "b",
    inventory: { "extra-turn": 1, "clear-row": 1, tip: 1 },
    placement: "free",
    difficulty: "extreme",
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    presetId: "4x4x4",
  });
  assert(decision.action === "none", "empty board: no power-up spend");
}

testTakesWinningMove();
testBlocksOpponentWin();
testFindWinningMoveHelper();
testTakesForkOnLargerBoard();
testBlocksOpponentFork();
testBlocksTwoPlyForce();
testTakesTwoPlyForce();
testExtremeAvoidsHandingForce();
testExtremeAllowedPresets();
testDropOpeningPrefersCenter();
testFreeOpeningPrefersCenter();
testClearIgnoresEmptyAndOwnOnlyLines();
testClearBreaksOpponentForkThreat();
testClearUsedOnOpponentFork();
testExtraTurnWhenDoublePlaceWins();
testExtraTurnForForkAfterPlace();
testExtraTurnBannedOn3x3x3();
testNoClearOnEmptyBoard();
console.log("ai.selftest: ok");
