/**
 * Extra window: Place/Space spends Extra at the aimed cell instead of ending
 * the turn. Run with: npx tsx src/game/extraPlace.selftest.ts
 */
import { cellKey, createEmptyBoard } from "./board";
import { emptyInventory } from "./powerUps";
import { useGameStore } from "./store";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function basePlayingState() {
  const board = createEmptyBoard();
  // Ordinary place already on the board; Extra window open.
  board.set(cellKey(0, 0, 0), "a");
  const inventory = emptyInventory();
  inventory.a["extra-turn"] = 1;

  useGameStore.setState({
    phase: "playing",
    playMode: "ai",
    presetId: "4x4x4",
    placement: "free",
    status: "playing",
    winner: null,
    winningLine: [],
    winningCell: null,
    board,
    occupiedCount: 1,
    currentPlayer: "a",
    startingPlayer: "a",
    powerUpsEnabled: true,
    inventory,
    bonusPlacesRemaining: 0,
    placedThisTurn: true,
    powerUpMode: null,
    powerUpToast: null,
    pendingSwarmEarner: "a",
    watchPowerUp: null,
    watchTipPlayback: false,
    pendingTipSync: null,
    clearBurst: null,
    pendingClearFinish: null,
    pendingClearSync: null,
    tipFalling: false,
    tipCheckpoint: null,
    tipDirty: false,
    dropBusy: false,
    swarmBusy: false,
    fallingKey: null,
    aiming: false,
    cursor: { x: 1, y: 0, z: 0 },
    lastPlaced: { x: 0, y: 0, z: 0 },
    onlineStatus: "idle",
    seat: null,
  });
}

function testPlaceAtCursorSpendsExtraAndPlaces() {
  basePlayingState();
  const before = useGameStore.getState();
  assert(before.inventory.a["extra-turn"] === 1, "Extra banked");
  assert(before.placedThisTurn, "Extra window open");
  assert(before.bonusPlacesRemaining === 0, "Extra not yet armed");

  const ok = before.placeAtCursor();
  assert(ok, "placeAtCursor succeeds");

  const after = useGameStore.getState();
  assert(after.board.get(cellKey(1, 0, 0)) === "a", "bonus ball at aimed cell");
  assert(after.inventory.a["extra-turn"] === 0, "Extra spent");
  assert(after.bonusPlacesRemaining === 0, "bonus consumed");
  assert(!after.placedThisTurn, "Extra window closed");
  assert(after.currentPlayer === "b", "turn flipped after bonus place");
  assert(after.powerUpMode === null, "power-up mode cleared");
}

function testPlaceAtCursorOnOccupiedDoesNotSpendOrEnd() {
  basePlayingState();
  useGameStore.setState({ cursor: { x: 0, y: 0, z: 0 } });

  const ok = useGameStore.getState().placeAtCursor();
  assert(!ok, "occupied aim rejected");

  const after = useGameStore.getState();
  assert(after.inventory.a["extra-turn"] === 1, "Extra not spent");
  assert(after.placedThisTurn, "Extra window still open");
  assert(after.currentPlayer === "a", "turn not flipped");
  assert(after.occupiedCount === 1, "board unchanged");
}

function testPlaceAtCursorOnFinisherDoesNotSpend() {
  // 4×4×4 win length is 4: three in a row + Extra aiming at the clincher.
  const threat = createEmptyBoard();
  threat.set(cellKey(0, 1, 0), "a"); // ordinary place this turn
  threat.set(cellKey(1, 1, 0), "a");
  threat.set(cellKey(2, 1, 0), "a");

  const inventory = emptyInventory();
  inventory.a["extra-turn"] = 1;
  useGameStore.setState({
    phase: "playing",
    playMode: "ai",
    presetId: "4x4x4",
    placement: "free",
    status: "playing",
    winner: null,
    winningLine: [],
    winningCell: null,
    board: threat,
    occupiedCount: 3,
    currentPlayer: "a",
    startingPlayer: "a",
    powerUpsEnabled: true,
    inventory,
    bonusPlacesRemaining: 0,
    placedThisTurn: true,
    powerUpMode: null,
    powerUpToast: null,
    pendingSwarmEarner: "a",
    dropBusy: false,
    swarmBusy: false,
    tipFalling: false,
    watchTipPlayback: false,
    clearBurst: null,
    pendingClearFinish: null,
    pendingClearSync: null,
    cursor: { x: 3, y: 1, z: 0 },
    lastPlaced: { x: 0, y: 1, z: 0 },
    onlineStatus: "idle",
    seat: null,
  });

  const ok = useGameStore.getState().placeAtCursor();
  assert(!ok, "finishing Extra rejected");

  const after = useGameStore.getState();
  assert(after.inventory.a["extra-turn"] === 1, "Extra not spent on finisher");
  assert(after.placedThisTurn, "Extra window still open");
  assert(after.powerUpToast != null, "toast explains no-finish rule");
  assert(after.currentPlayer === "a", "turn not flipped");
  assert(!after.board.has(cellKey(3, 1, 0)), "finishing cell empty");
}

function testDoneStillEndsTurn() {
  basePlayingState();
  const ok = useGameStore.getState().endTurn();
  assert(ok, "Done ends Extra window");

  const after = useGameStore.getState();
  assert(after.currentPlayer === "b", "turn flipped");
  assert(!after.placedThisTurn, "window closed");
  assert(after.inventory.a["extra-turn"] === 1, "Extra kept when declined");
  assert(!after.board.has(cellKey(1, 0, 0)), "no bonus ball placed");
}

testPlaceAtCursorSpendsExtraAndPlaces();
testPlaceAtCursorOnOccupiedDoesNotSpendOrEnd();
testPlaceAtCursorOnFinisherDoesNotSpend();
testDoneStillEndsTurn();
console.log("extraPlace.selftest: ok");
