/**
 * Assert-based self-check for power-up helpers — run with `npm run check:powerups`.
 */
import { cellKey, cellToWorld, checkWinAny, createEmptyBoard, worldToCell } from "./board";
import {
  axisLineCells,
  clearAxisLine,
  clearFixedFromCursor,
  nextClearAxis,
  repackDrop,
} from "./clearRow";
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
  isPowerUpAllowed,
  pickRandomKind,
  planSwarm,
  powerUpsForPreset,
  shouldAttemptSwarm,
  spendPowerUp,
  underCapKinds,
} from "./powerUps";
import {
  canTipPreset,
  cellThroughTipEuler,
  eulerForTipDown,
  tipBoard,
  tipChoices,
  tipDownFromEuler,
  tipRemap,
  tipRemapFromEuler,
} from "./tipBoard";
import { eulerToQuat, tipEulerFromSwipe } from "./tipNav";
import type { BoardDims } from "./types";
import { Vector3 } from "three";

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
      occupiedCount: SWARM_MIN_PLY - 1,
      earnerCounts: counts,
      rng: rngYes,
    }),
    "before min ply → no",
  );
  assert(
    shouldAttemptSwarm({
      powerUpsEnabled: true,
      occupiedCount: SWARM_MIN_PLY,
      earnerCounts: counts,
      rng: rngYes,
    }),
    "at min ply + low rng → yes",
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
    shouldAttemptSwarm({
      powerUpsEnabled: true,
      occupiedCount: 10,
      earnerCounts: full,
      rng: rngYes,
    }),
    "full inventory still allows competitive flyby",
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

function testExtraTurnBannedOn3x3x3() {
  assert(!isPowerUpAllowed("extra-turn", "3x3x3"), "extra banned");
  assert(isPowerUpAllowed("clear-row", "3x3x3"), "clear ok");
  assert(isPowerUpAllowed("tip", "3x3x3"), "tip ok");
  assert(isPowerUpAllowed("extra-turn", "4x4x4"), "extra ok on 4³");
  assert(powerUpsForPreset("3x3x3").length === 2, "two kinds on 3³");
  assert(underCapKinds(emptyCounts(), "3x3x3").length === 2, "underCap skips extra");
  assert(awardPowerUp(emptyCounts(), "extra-turn", "3x3x3") === null, "cannot award extra");
  const kind = pickRandomKind(emptyCounts(), () => 0, "3x3x3");
  assert(kind !== "extra-turn", "pick never returns extra on 3³");
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

function testClearCursorAxis() {
  const cursor = { x: 1, y: 2, z: 0 };
  assert(
    clearFixedFromCursor("x", cursor).a === 2 && clearFixedFromCursor("x", cursor).b === 0,
    "x-axis fixes y,z",
  );
  assert(
    clearFixedFromCursor("y", cursor).a === 1 && clearFixedFromCursor("y", cursor).b === 0,
    "y-axis fixes x,z",
  );
  assert(
    clearFixedFromCursor("z", cursor).a === 1 && clearFixedFromCursor("z", cursor).b === 2,
    "z-axis fixes x,y",
  );
  assert(nextClearAxis("x") === "y", "cycle x→y");
  assert(nextClearAxis("y") === "z", "cycle y→z");
  assert(nextClearAxis("z") === "x", "cycle z→x");
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
  const tipped = tipBoard(board, dims, "-x");
  assert(tipped.size === 2, "both pieces kept");
  // Three.js Z+90°: local −x → world −y; column/x remap matches visual tip.
  assert(tipped.get(cellKey(1, 0, 1)) === "b", "b maps to (1,0,1)");
  assert(tipped.get(cellKey(0, 0, 1)) === "a", "a maps to (0,0,1)");
  assert(tipChoices().length === 5, "5 tip choices excl −y");
  for (const d of ["+x", "-x", "+y", "-y", "+z", "-z"] as const) {
    assert(tipDownFromEuler(eulerForTipDown(d)) === d, `euler round-trip ${d}`);
  }
}

function testTipRemapIncludesYaw() {
  const dims = { x: 4, y: 4, z: 4 };
  let board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  board.set(cellKey(1, 0, 0), "b");

  // Face helper is canonical-spin euler remap.
  for (const d of ["+x", "-x", "+y", "+z", "-z"] as const) {
    const face = tipRemap(board, dims, d);
    const fromEuler = tipRemapFromEuler(board, dims, eulerForTipDown(d));
    assert(face.length === fromEuler.length, `len ${d}`);
    for (let i = 0; i < face.length; i++) {
      assert(
        face[i]!.to.x === fromEuler[i]!.to.x &&
          face[i]!.to.y === fromEuler[i]!.to.y &&
          face[i]!.to.z === fromEuler[i]!.to.z &&
          face[i]!.key === fromEuler[i]!.key,
        `face vs euler mismatch ${d} ${face[i]!.key}`,
      );
    }
  }

  // Remap landings must match visual quat * cellToWorld (the fall start).
  let e = { x: 0, y: 0, z: 0 };
  e = tipEulerFromSwipe(e, new Vector3(1, 0, 0), 80, 0);
  e = tipEulerFromSwipe(e, new Vector3(1, 0, 0), 0, -80);
  const down = tipDownFromEuler(e);
  assert(down !== "-y", "yaw+flip leaves upright");

  const q = eulerToQuat(e);
  for (const [key] of board) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    const from = { x, y, z };
    const [wx, wy, wz] = cellToWorld(from, dims);
    const world = new Vector3(wx, wy, wz).applyQuaternion(q);
    const viaWorld = worldToCell(world.x, world.y, world.z, dims);
    assert(viaWorld !== null, `world cell ${key}`);
    const viaEuler = cellThroughTipEuler(from, e, dims.x);
    assert(
      viaEuler.x === viaWorld.x && viaEuler.y === viaWorld.y && viaEuler.z === viaWorld.z,
      `euler cell must match visual world ${key}`,
    );
  }

  const faceOnly = tipRemap(board, dims, down);
  const full = tipRemapFromEuler(board, dims, e);
  const faceKey = faceOnly
    .map((r) => `${r.key}:${r.to.x},${r.to.y},${r.to.z}`)
    .sort()
    .join("|");
  const fullKey = full
    .map((r) => `${r.key}:${r.to.x},${r.to.y},${r.to.z}`)
    .sort()
    .join("|");
  assert(faceKey !== fullKey, "yaw changes landing cells vs face-only");

  // Packed landing XZ equals rotated column (no lateral teleport after fall).
  for (const entry of full) {
    const rotated = cellThroughTipEuler(entry.from, e, dims.x);
    assert(entry.to.x === rotated.x && entry.to.z === rotated.z, `pack keeps column ${entry.key}`);
  }
}

function testTipNavCombined() {
  const right = new Vector3(1, 0, 0);
  let e = { x: 0, y: 0, z: 0 };

  e = tipEulerFromSwipe(e, right, 80, 0);
  assert(tipDownFromEuler(e) === "-y", "yaw keeps −y floor");

  e = tipEulerFromSwipe(e, right, 0, -80);
  const afterFlip = tipDownFromEuler(e);
  assert(afterFlip !== "-y", "flip changes floor");

  const spun = tipEulerFromSwipe(e, right, 80, 0);
  assert(tipDownFromEuler(spun) === afterFlip, "yaw while tipped keeps same floor");
  assert(spun.x !== e.x || spun.y !== e.y || spun.z !== e.z, "yaw while tipped actually turns");

  // Flip then yaw then flip again should still change the floor.
  const again = tipEulerFromSwipe(spun, right, 0, -80);
  assert(tipDownFromEuler(again) !== afterFlip, "second flip changes floor again");
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
testExtraTurnBannedOn3x3x3();
testAiCatch();
testClearCursorAxis();
testClearAndRepack();
testTipCube();
testTipRemapIncludesYaw();
testTipNavCombined();
testTipCreatesWin();
console.log("powerUps.selftest ok");
