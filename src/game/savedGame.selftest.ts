/**
 * Assert-based self-check for saved-game parse/match — `npm run check:saved`.
 */
import { parseSavedGame, savedGameMatchesSetup, type SavedGame } from "./savedGame";
import { emptyInventory } from "./powerUps";
import { useGameStore } from "./store";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const base: SavedGame = {
  presetId: "4x4x4",
  playMode: "ai",
  placement: "drop",
  aiDifficulty: "hard",
  powerUpsEnabled: true,
  board: [
    ["0,0,0", "a"],
    ["1,0,0", "b"],
  ],
  occupiedCount: 2,
  currentPlayer: "a",
  startingPlayer: "a",
  inventory: emptyInventory(),
  bonusPlacesRemaining: 0,
};

function testValidBlob() {
  const saved = parseSavedGame({ ...base, board: [...base.board] });
  assert(saved != null, "parsed");
  assert(saved.presetId === "4x4x4", "preset");
  assert(saved.playMode === "ai", "mode");
  assert(saved.placement === "drop", "placement");
  assert(saved.aiDifficulty === "hard", "difficulty");
  assert(saved.board.length === 2, "board len");
  assert(saved.occupiedCount === 2, "occupied");
}

function testLegacyPresetId() {
  const saved = parseSavedGame({ ...base, presetId: "4x4x3" });
  assert(saved != null && saved.presetId === "4x4x4", "legacy preset");
}

function testRejectsEmptyBoard() {
  assert(parseSavedGame({ ...base, board: [] }) == null, "empty board");
  assert(parseSavedGame({ ...base, board: "nope" }) == null, "bad board");
}

function testRejectsOnlineMode() {
  assert(parseSavedGame({ ...base, playMode: "online" }) == null, "online");
  assert(parseSavedGame({ ...base, playMode: "lan" }) == null, "junk mode");
}

function testMatchGridAndDifficulty() {
  assert(
    savedGameMatchesSetup(base, {
      presetId: "4x4x4",
      playMode: "ai",
      placement: "drop",
      aiDifficulty: "hard",
      powerUpsEnabled: true,
    }),
    "exact match",
  );
  assert(
    !savedGameMatchesSetup(base, {
      presetId: "3x3x3",
      playMode: "ai",
      placement: "drop",
      aiDifficulty: "hard",
      powerUpsEnabled: true,
    }),
    "grid mismatch",
  );
  assert(
    !savedGameMatchesSetup(base, {
      presetId: "4x4x4",
      playMode: "ai",
      placement: "drop",
      aiDifficulty: "easy",
      powerUpsEnabled: true,
    }),
    "difficulty mismatch",
  );
}

function testHotseatIgnoresDifficulty() {
  const hotseat: SavedGame = { ...base, playMode: "hotseat", powerUpsEnabled: false };
  assert(
    savedGameMatchesSetup(hotseat, {
      presetId: "4x4x4",
      playMode: "hotseat",
      placement: "drop",
      aiDifficulty: "easy",
      powerUpsEnabled: false,
    }),
    "hotseat match despite difficulty chip",
  );
}

function testNullSafe() {
  assert(parseSavedGame(null) == null, "null");
  assert(parseSavedGame("nope") == null, "string");
}

function testRestoreDropInArmsWithoutStartingClock() {
  const stacked: SavedGame = {
    ...base,
    playMode: "hotseat",
    powerUpsEnabled: false,
    board: [
      ["1,0,0", "a"],
      ["0,2,1", "b"],
      ["0,0,0", "a"],
      ["0,1,0", "b"],
    ],
    occupiedCount: 4,
  };

  useGameStore.getState().restoreGame(stacked);
  const armed = useGameStore.getState();
  assert(armed.phase === "playing", "phase");
  assert(armed.dropBusy === true, "dropBusy while restoring");
  assert(armed.restoreFallingKeys != null, "keys armed");
  assert(armed.restoreFallingKeys!.length === 4, "all marks animate");
  assert(armed.restoreStartedAt == null, "clock waits for scene frame");

  // Bottom-up packing order: lower y first, then x, then z.
  assert(
    armed.restoreFallingKeys!.join("|") === "0,0,0|1,0,0|0,1,0|0,2,1",
    `order was ${armed.restoreFallingKeys!.join("|")}`,
  );

  useGameStore.getState().startRestoreClock();
  const started = useGameStore.getState().restoreStartedAt;
  assert(started != null, "clock stamped");
  useGameStore.getState().startRestoreClock();
  assert(useGameStore.getState().restoreStartedAt === started, "clock idempotent");

  for (const key of armed.restoreFallingKeys!) {
    useGameStore.getState().finishRestoreBall(key);
  }
  const done = useGameStore.getState();
  assert(done.restoreFallingKeys == null, "cleared keys");
  assert(done.restoreStartedAt == null, "cleared clock");
  assert(done.dropBusy === false, "dropBusy cleared");
}

testValidBlob();
testLegacyPresetId();
testRejectsEmptyBoard();
testRejectsOnlineMode();
testMatchGridAndDifficulty();
testHotseatIgnoresDifficulty();
testNullSafe();
testRestoreDropInArmsWithoutStartingClock();
console.log("savedGame.selftest: ok");
