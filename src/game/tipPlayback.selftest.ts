/**
 * Assert AI Tip commit uses rotate→fall playback, then spends and hands off.
 * Run with: npx tsx src/game/tipPlayback.selftest.ts
 */
import { cellKey, createEmptyBoard } from "./board";
import { fullInventory } from "./powerUps";
import { useGameStore } from "./store";
import { eulerForTipDown, tipBoardFromEuler, tipDownFromEuler } from "./tipBoard";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testAiTipPlaybackSpendsAndHandsOff() {
  const board = createEmptyBoard();
  board.set(cellKey(0, 1, 0), "a");
  board.set(cellKey(1, 2, 1), "b");
  const tipEuler = eulerForTipDown("+x");
  const expected = tipBoardFromEuler(board, { x: 3, y: 3, z: 3 }, tipEuler);
  const invBefore = fullInventory();

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
    occupiedCount: 2,
    currentPlayer: "b",
    startingPlayer: "a",
    powerUpsEnabled: true,
    inventory: invBefore,
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    powerUpMode: null,
    powerUpToast: null,
    watchPowerUp: null,
    watchTipPlayback: false,
    pendingTipSync: null,
    tipEuler: { x: 0, y: 0, z: 0 },
    tipTargetEuler: { x: 0, y: 0, z: 0 },
    tipFalling: false,
    tipCheckpoint: null,
    tipDirty: false,
    dropBusy: false,
    swarmBusy: false,
    aiming: false,
  });

  // Mirror maybeAiSpendPowerUp tip branch — start spectator-style playback.
  useGameStore.setState({
    powerUpToast: null,
    watchTipPlayback: true,
    tipEuler: { x: 0, y: 0, z: 0 },
    tipTargetEuler: { ...tipEuler },
    tipFalling: false,
  });

  let s = useGameStore.getState();
  assert(s.watchTipPlayback, "playback armed");
  assert(s.inventory.b.tip === invBefore.b.tip, "tip not spent until fall settles");
  assert(s.currentPlayer === "b", "still AI turn during playback");
  assert(tipDownFromEuler(s.tipTargetEuler) === "+x", "target floor is +x");

  s.beginTipFall();
  s = useGameStore.getState();
  assert(s.tipFalling, "fall started after rotate");
  assert(s.tipEuler.x === tipEuler.x && s.tipEuler.z === tipEuler.z, "euler locked");

  s.finishTipFall();
  s = useGameStore.getState();
  assert(!s.watchTipPlayback, "playback cleared");
  assert(!s.tipFalling, "fall cleared");
  assert(s.currentPlayer === "a", "hand off to human after AI tip");
  assert(s.inventory.b.tip === invBefore.b.tip - 1, "AI tip spent on settle");
  assert(
    s.powerUpToast === `${s.displayName("b")} tipped the field`,
    "toast after settle",
  );
  assert(s.board.size === expected.size, "board remapped");
  for (const [k, p] of expected) {
    assert(s.board.get(k) === p, `cell ${k} matches tip remap`);
  }
}

function main() {
  testAiTipPlaybackSpendsAndHandsOff();
  console.log("tipPlayback.selftest: ok");
}

main();
