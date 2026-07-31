/**
 * Assert-based self-check for power-up helpers — run with `npm run check:powerups`.
 */
import { cellKey, checkWinAny, createEmptyBoard } from "./board";
import { axisLineCells, clearAxisLine, repackDrop } from "./clearRow";
import {
  AI_CATCH_CHANCE,
  MAX_PER_KIND,
  SWARM_CHANCE,
  SWARM_MIN_PLY,
  SWARM_PACKAGE_COUNT,
  aiCatchRoll,
  awardPowerUp,
  createPowerUpRng,
  emptyCounts,
  hasInventoryRoom,
  pickRandomKind,
  planSwarm,
  shouldAttemptSwarm,
  spendPowerUp,
  underCapKinds,
} from "./powerUps";
import { canTipPreset, tipBoard, tipChoices } from "./tipBoard";
import type { BoardDims } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testInventoryCaps() {
  let c = emptyCounts();
  assert(underCapKinds(c).length === 3, "empty → all open");
  c = awardPowerUp(c, "extra-turn")!;
  c = awardPowerUp(c, "extra-turn")!;
  assert(c["extra-turn"] === MAX_PER_KIND, "cap 2");
  assert(awardPowerUp(c, "extra-turn") === null, "over cap rejected");
  assert(underCapKinds(c).length === 2, "two kinds still open");
  const spent = spendPowerUp(c, "extra-turn");
  assert(spent !== null && spent["extra-turn"] === 1, "spend works");
}

function testSwarmGate() {
  const rngYes = () => 0;
  const rngNo = () => 0.99;
  const counts = emptyCounts();
  assert(
    !shouldAttemptSwarm({
      powerUpsEnabled: true,
      occupiedCount: 5,
      earnerCounts: counts,
      rng: rngYes,
    }),
    "before ply 6 → no",
  );
  assert(
    shouldAttemptSwarm({
      powerUpsEnabled: true,
      occupiedCount: SWARM_MIN_PLY,
      earnerCounts: counts,
      rng: rngYes,
    }),
    "ply 6 + low rng → yes",
  );
  assert(
    !shouldAttemptSwarm({
      powerUpsEnabled: true,
      occupiedCount: 10,
      earnerCounts: counts,
      rng: rngNo,
    }),
    "high rng → no",
  );
  const full = {
    "extra-turn": 2,
    "clear-row": 2,
    tip: 2,
  } as const;
  assert(!hasInventoryRoom(full), "full inventory");
  assert(
    !shouldAttemptSwarm({
      powerUpsEnabled: true,
      occupiedCount: 10,
      earnerCounts: full,
      rng: rngYes,
    }),
    "full → skip swarm",
  );
  assert(SWARM_CHANCE > 0 && SWARM_CHANCE < 1, "swarm chance sane");
  assert(AI_CATCH_CHANCE > 0, "ai catch chance");
}

function testPlanSwarmDeterministic() {
  const a = planSwarm(42, "a", createPowerUpRng(42));
  const b = planSwarm(42, "a", createPowerUpRng(42));
  assert(a.liveIndex === b.liveIndex, "same live index");
  assert(a.packages.length === SWARM_PACKAGE_COUNT, "3 packages");
  assert(
    a.packages.every((p, i) => p.x0 === b.packages[i]!.x0 && p.y0 === b.packages[i]!.y0),
    "same paths",
  );
}

function testPickKindRespectsCap() {
  const rng = createPowerUpRng(7);
  let c = emptyCounts();
  c = { ...c, "extra-turn": 2, "clear-row": 2 };
  const kind = pickRandomKind(c, rng);
  assert(kind === "tip", "only tip open");
}

function testAiCatch() {
  const yes = createPowerUpRng(1);
  // Burn until we see both outcomes over many rolls
  let hits = 0;
  const rng = createPowerUpRng(99);
  for (let i = 0; i < 3000; i++) if (aiCatchRoll(rng)) hits++;
  assert(hits > 700 && hits < 1300, `ai catch ~1/3, got ${hits}/3000`);
  assert(typeof yes() === "number", "rng works");
}

function testClearAndRepack() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  let board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "b");
  board.set(cellKey(2, 0, 0), "a");
  board.set(cellKey(1, 2, 0), "b");
  const line = axisLineCells(dims, "x", 0, 0);
  assert(line.length === 3, "x-line length 3");
  board = clearAxisLine(board, dims, "x", 0, 0);
  assert(!board.has(cellKey(0, 0, 0)), "cleared");
  assert(board.has(cellKey(1, 2, 0)), "other cell kept");
  board = repackDrop(board, dims);
  assert(board.get(cellKey(1, 0, 0)) === "b", "repack dropped b to floor");
  assert(!board.has(cellKey(1, 2, 0)), "old height cleared");
}

function testTipCube() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  assert(canTipPreset(dims), "3³ is cube");
  assert(!canTipPreset({ x: 5, y: 5, z: 4 }), "5×5×4 not cube");
  let board = createEmptyBoard();
  board.set(cellKey(0, 2, 1), "a");
  board.set(cellKey(0, 1, 1), "b");
  // Tip so −x becomes floor: pieces at x=0 fall to y=0, stacked by old y
  const tipped = tipBoard(board, dims, "-x");
  assert(tipped.get(cellKey(1, 0, 1)) === "b" || tipped.get(cellKey(2, 0, 1)) === "b" || tipped.size === 2, "pieces survive");
  assert(tipped.size === 2, "both pieces kept");
  // After −x tip: new_y = old_x (=0), so both at y=0; new_x = old_y → b at x=1, a at x=2, same z
  assert(tipped.get(cellKey(1, 0, 1)) === "b", "b was lower y → packs first? wait sort by new y then key");
  // Both have new_y=0; packed by sort y then key — same column (new_x differs!)
  // b: (0,1,1) → (1,0,1); a: (0,2,1) → (2,0,1) — different columns
  assert(tipped.get(cellKey(2, 0, 1)) === "a", "a maps to x=2");
  assert(tipChoices().length === 5, "5 tip choices excl −y");
}

function testTipCreatesWin() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  let board = createEmptyBoard();
  // Three coral along x at y=2 — after tip +y (flip), they go to y=0 still in a line
  board.set(cellKey(0, 2, 1), "a");
  board.set(cellKey(1, 2, 1), "a");
  board.set(cellKey(2, 2, 1), "a");
  const tipped = tipBoard(board, dims, "+y");
  const win = checkWinAny(tipped, dims);
  assert(win !== null && win.winner === "a", "line still wins after 180 tip");
}

testInventoryCaps();
testSwarmGate();
testPlanSwarmDeterministic();
testPickKindRespectsCap();
testAiCatch();
testClearAndRepack();
testTipCube();
testTipCreatesWin();
console.log("powerUps.selftest ok");
