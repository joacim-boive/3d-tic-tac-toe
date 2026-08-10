/**
 * Clear confirm starts staggered confetti playback, then finishClearBurst applies the board.
 * Run with: npx tsx src/game/clearBurst.selftest.ts
 */
import { cellKey, createEmptyBoard } from "./board";
import { CLEAR_STAGGER_MS } from "./clearRow";
import { emptyInventory } from "./powerUps";
import { useGameStore } from "./store";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function primedClearState() {
  const board = createEmptyBoard();
  board.set(cellKey(0, 1, 1), "a");
  board.set(cellKey(1, 1, 1), "b");
  board.set(cellKey(2, 1, 1), "a");
  board.set(cellKey(1, 0, 1), "b"); // off-line
  const inventory = emptyInventory();
  inventory.a["clear-row"] = 1;

  useGameStore.setState({
    phase: "playing",
    playMode: "ai",
    presetId: "3x3x3",
    placement: "free",
    status: "playing",
    winner: null,
    winningLine: [],
    winningCell: null,
    board,
    occupiedCount: 4,
    currentPlayer: "a",
    startingPlayer: "a",
    powerUpsEnabled: true,
    inventory,
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    powerUpMode: "clear-row",
    clearAxis: "x",
    powerUpToast: null,
    watchPowerUp: null,
    watchTipPlayback: false,
    pendingTipSync: null,
    clearBurst: null,
    pendingClearFinish: null,
    pendingClearSync: null,
    tipFalling: false,
    dropBusy: false,
    swarmBusy: false,
    aiming: false,
    cursor: { x: 1, y: 1, z: 1 },
    onlineStatus: "idle",
    seat: null,
  });
}

{
  primedClearState();
  const ok = useGameStore.getState().confirmClearRow(1, 1);
  assert(ok, "confirmClearRow accepted");

  const mid = useGameStore.getState();
  assert(mid.clearBurst != null, "clearBurst armed");
  assert(mid.clearBurst!.balls.length === 3, "three balls explode");
  assert(mid.clearBurst!.balls[1]!.delayMs === CLEAR_STAGGER_MS, "staggered delays");
  assert(mid.pendingClearFinish != null, "pending board held");
  assert(mid.board.has(cellKey(0, 1, 1)), "pre-clear board still visible");
  assert(mid.powerUpMode === null, "aim mode exited");
  assert(mid.inventory.a["clear-row"] === 1, "inventory spends on finish");
  assert(mid.currentPlayer === "a", "turn held during VFX");

  mid.finishClearBurst();
  const after = useGameStore.getState();
  assert(after.clearBurst == null, "burst cleared");
  assert(after.pendingClearFinish == null, "pending cleared");
  assert(!after.board.has(cellKey(0, 1, 1)), "line cleared");
  assert(!after.board.has(cellKey(1, 1, 1)), "line cleared");
  assert(after.board.has(cellKey(1, 0, 1)), "off-line kept");
  assert(after.inventory.a["clear-row"] === 0, "clear spent");
  assert(after.currentPlayer === "b", "turn flipped after VFX");
}

{
  // Empty line: no VFX, finish immediately.
  const board = createEmptyBoard();
  board.set(cellKey(0, 0, 0), "a");
  const inventory = emptyInventory();
  inventory.a["clear-row"] = 1;
  useGameStore.setState({
    phase: "playing",
    playMode: "ai",
    presetId: "3x3x3",
    placement: "free",
    status: "playing",
    board,
    occupiedCount: 1,
    currentPlayer: "a",
    powerUpsEnabled: true,
    inventory,
    powerUpMode: "clear-row",
    clearAxis: "x",
    clearBurst: null,
    pendingClearFinish: null,
    cursor: { x: 0, y: 2, z: 2 },
    dropBusy: false,
    swarmBusy: false,
  });
  const ok = useGameStore.getState().confirmClearRow(2, 2);
  assert(ok, "empty clear ok");
  const after = useGameStore.getState();
  assert(after.clearBurst == null, "no VFX for empty line");
  assert(after.currentPlayer === "b", "turn flipped immediately");
  assert(after.inventory.a["clear-row"] === 0, "spent");
}

console.log("clearBurst.selftest: ok");
