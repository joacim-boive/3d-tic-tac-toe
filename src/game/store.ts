import { create } from "zustand";
import { pickAiMove } from "./ai";
import { pickAiPowerUpSpend } from "./aiPowerUps";
import {
  cellKey,
  checkWin,
  checkWinAny,
  createEmptyBoard,
  dropLanding,
  isDraw,
  listDropLandings,
  listEmptyCells,
  resolvePlaceCoord,
  wouldPlaceWin,
  type Board,
} from "./board";
import {
  clearAxisLine,
  clearFixedFromCursor,
  nextClearAxis,
  planClearBurst,
  repackDrop,
  type Axis,
  type ClearBurstBall,
} from "./clearRow";
import { getPreset, resolvePresetId } from "./presets";
import { nextVsAiNames } from "./playerAliases";
import {
  awardPowerUp,
  canSpend,
  cloneInventory,
  createPowerUpRng,
  emptyInventory,
  EXTRA_NO_FINISH_TOAST,
  hasInventoryRoom,
  isPowerUpAllowed,
  pickAiSwarmTarget,
  pickRandomKind,
  planSwarm,
  raceEndPopped,
  randomSeed,
  shouldAttemptSwarm,
  spendPowerUp,
  SWARM_COOLDOWN_PLIES,
  type PowerUpId,
  type PowerUpInventory,
  type SwarmPlan,
  type SwarmTapOutcome,
} from "./powerUps";
import { clearSavedGameFromStorage, writeSavedGameToStorage, type SavedGame } from "./savedGame";
import { recordAiMatchResult, type AiMatchOutcome } from "./gameStats";
import {
  readSetupPrefsFromStorage,
  readSetupPrefsFromUrl,
  writeSetupPrefsToStorage,
  writeSetupPrefsToUrl,
  type SetupPrefs,
} from "./setupPrefs";
import {
  IDENTITY_TIP_EULER,
  canTipPreset,
  eulerForTipDown,
  tipBoardFromEuler,
  tipDownFromEuler,
  type TipDown,
  type TipEuler,
} from "./tipBoard";
import type {
  AiDifficulty,
  CellCoord,
  GameStatus,
  OnlineStatus,
  PlacementMode,
  PlayMode,
  PlayerId,
  PlayerNames,
  PresetId,
  RematchVotes,
} from "./types";
import { PLAYER_LABELS, centerCell } from "./types";

const AI_DELAY_MS = 400;
/** How long the award chip bounce/highlight stays visible. */
const INVENTORY_PULSE_MS = 1100;
const HUMAN: PlayerId = "a";
const AI_PLAYER: PlayerId = "b";
const LOCAL_NAME_KEY = "voxel-toe-name";

const EMPTY_NAMES: PlayerNames = { a: "", b: "" };
const EMPTY_VOTES: RematchVotes = { a: null, b: null };

export type PowerUpMode = PowerUpId | null;

/** Brief HUD cue after someone banks a caught package. */
export type InventoryPulse = {
  by: PlayerId;
  kind: PowerUpId;
  /** Monotonic id so re-awarding the same kind retriggers CSS animation. */
  id: number;
};

/** Spectator overlay for an opponent's in-progress power-up (online). */
export type WatchPowerUp =
  | {
      kind: "clear-row";
      by: PlayerId;
      clearAxis: Axis;
      cursor: CellCoord;
    }
  | {
      kind: "tip";
      by: PlayerId;
      toDown: TipDown | null;
    };

function opponentOf(player: PlayerId): PlayerId {
  return player === "a" ? "b" : "a";
}

function persistLocalName(name: string) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = name.trim().slice(0, 16);
    if (trimmed) localStorage.setItem(LOCAL_NAME_KEY, trimmed);
    else localStorage.removeItem(LOCAL_NAME_KEY);
  } catch {
    // ponytail: private mode / quota — name just won't stick across reloads
  }
}

function persistSetupPrefs(state: {
  presetId: PresetId;
  playMode: PlayMode;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  powerUpsEnabled: boolean;
}) {
  const prefs: SetupPrefs = {
    presetId: state.presetId,
    playMode: state.playMode,
    placement: state.placement,
    aiDifficulty: state.aiDifficulty,
    powerUpsEnabled: state.powerUpsEnabled,
  };
  writeSetupPrefsToStorage(prefs);
  // Keep the address bar shareable while on the home setup route.
  if (typeof window !== "undefined" && window.location.pathname === "/") {
    writeSetupPrefsToUrl(prefs);
  }
}

function snapshotLocalGame(state: {
  playMode: PlayMode;
  status: GameStatus;
  occupiedCount: number;
  tipFalling: boolean;
  powerUpMode: PowerUpMode;
  swarmBusy: boolean;
  presetId: PresetId;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  powerUpsEnabled: boolean;
  board: Board;
  currentPlayer: PlayerId;
  startingPlayer: PlayerId;
  inventory: PowerUpInventory;
  bonusPlacesRemaining: number;
  placedThisTurn: boolean;
}): SavedGame | null {
  if (state.playMode !== "hotseat" && state.playMode !== "ai") return null;
  if (state.status !== "playing" || state.occupiedCount <= 0) return null;
  // Skip mid-animation / mode boards — wait for a settled frame.
  if (state.tipFalling || state.powerUpMode || state.swarmBusy) return null;
  // Don't snapshot mid Extra-extend — wait until the turn fully ends.
  if (state.placedThisTurn || state.bonusPlacesRemaining > 0) return null;
  return {
    presetId: state.presetId,
    playMode: state.playMode,
    placement: state.placement,
    aiDifficulty: state.aiDifficulty,
    powerUpsEnabled: state.powerUpsEnabled,
    board: Array.from(state.board.entries()),
    occupiedCount: state.occupiedCount,
    currentPlayer: state.currentPlayer,
    startingPlayer: state.startingPlayer,
    inventory: cloneInventory(state.inventory),
    bonusPlacesRemaining: state.bonusPlacesRemaining,
  };
}

function persistLocalGame(state: Parameters<typeof snapshotLocalGame>[0]) {
  const snap = snapshotLocalGame(state);
  if (snap) writeSavedGameToStorage(snap);
  else if (state.playMode === "hotseat" || state.playMode === "ai") {
    if (state.status !== "playing" || state.occupiedCount <= 0) {
      clearSavedGameFromStorage();
    }
  }
}

/** Persist vs-AI career stats once a match reaches won/draw. */
function recordAiMatchStats(state: {
  playMode: PlayMode;
  status: GameStatus;
  winner: PlayerId | null;
  aiDifficulty: AiDifficulty;
  matchStartedAt: number | null;
}) {
  if (state.playMode !== "ai") return;
  if (state.status !== "won" && state.status !== "draw") return;

  let outcome: AiMatchOutcome;
  if (state.status === "draw" || state.winner == null) outcome = "draw";
  else if (state.winner === HUMAN) outcome = "win";
  else outcome = "loss";

  const started = state.matchStartedAt ?? Date.now();
  const durationMs = Math.max(0, Date.now() - started);
  recordAiMatchResult({
    difficulty: state.aiDifficulty,
    outcome,
    durationMs,
  });
}

/** Bottom-up column order so stacked restore drops read as packing, not chaos. */
function restoreDropOrder(board: Board): string[] {
  return Array.from(board.keys()).sort((a, b) => {
    const [ax, ay, az] = a.split(",").map(Number);
    const [bx, by, bz] = b.split(",").map(Number);
    return ay! - by! || ax! - bx! || az! - bz!;
  });
}

type GamePhase = "setup" | "lobby" | "playing";

type GameState = {
  phase: GamePhase;
  presetId: PresetId;
  playMode: PlayMode;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  powerUpsEnabled: boolean;
  inventory: PowerUpInventory;
  /** Extra places left after the next place (1 = place the bonus ball). */
  bonusPlacesRemaining: number;
  /**
   * True after the ordinary place this turn. Extra can only activate then;
   * Clear/Tip stay pre-place only. Ends via Extra bonus place or `endTurn`.
   */
  placedThisTurn: boolean;
  /** Player who earned the pending swarm (for post-extra-turn deferral). */
  pendingSwarmEarner: PlayerId | null;
  swarm: SwarmPlan | null;
  swarmBusy: boolean;
  /** Local + remote pops during a competitive flyby. */
  swarmPopped: Record<number, SwarmTapOutcome>;
  powerUpMode: PowerUpMode;
  clearAxis: Axis;
  powerUpToast: string | null;
  /** Who just banked a catch — HUD bounces that chip for ~1s. */
  inventoryPulse: InventoryPulse | null;
  /**
   * Spectator view of opponent's in-progress power-up (online).
   * Clear: live shaft. Tip: floor-face hint without rotating our cube.
   */
  watchPowerUp: WatchPowerUp | null;
  /**
   * Spectator is replaying an opponent's Tip commit (rotate → fall).
   * Aiming still does not rotate; only commit playback does.
   */
  watchTipPlayback: boolean;
  /** Board/turn snapshot held until spectator tip playback finishes. */
  pendingTipSync: {
    board: Board;
    occupiedCount: number;
    currentPlayer: PlayerId;
    status: GameStatus;
    winner: PlayerId | null;
    winningLine: CellCoord[];
    winningCell: CellCoord | null;
    inventory: PowerUpInventory;
    bonusPlacesRemaining: number;
    placedThisTurn: boolean;
    onlineStatus: OnlineStatus;
  } | null;
  /**
   * Staggered clear-row confetti playback. Board stays pre-clear until finish.
   * Markers skip these keys; ClearConfettiBurst owns the exploding spheres.
   */
  clearBurst: {
    id: number;
    balls: ClearBurstBall[];
    startedAt: number;
  } | null;
  /** Local / AI clear: apply this board via finishPowerUpBoard when VFX ends. */
  pendingClearFinish: {
    board: Board;
    by: PlayerId;
    spent: PowerUpInventory["a"];
    toast: string;
  } | null;
  /** Online spectator: hold authoritative state until clear confetti finishes. */
  pendingClearSync: {
    board: Board;
    occupiedCount: number;
    currentPlayer: PlayerId;
    status: GameStatus;
    winner: PlayerId | null;
    winningLine: CellCoord[];
    winningCell: CellCoord | null;
    inventory: PowerUpInventory;
    bonusPlacesRemaining: number;
    placedThisTurn: boolean;
    onlineStatus: OnlineStatus;
  } | null;
  /** vs AI: which package the AI will tap in the race (null outside AI swarms). */
  swarmAiResult: { targetIndex: number } | null;
  /** Block new swarms until occupiedCount reaches this (0 = none). */
  swarmCooldownUntilPly: number;
  /** Current snapped tip orientation (tip mode). */
  tipEuler: TipEuler;
  /** Animated tip target (drag tumbles toward this). */
  tipTargetEuler: TipEuler;
  /** True while balls animate toward the new floor. */
  tipFalling: boolean;
  /** Board snapshot when tip mode started (Cancel restores). */
  tipCheckpoint: Board | null;
  /** True after at least one tip+fall settled this activation. */
  tipDirty: boolean;
  board: Board;
  occupiedCount: number;
  currentPlayer: PlayerId;
  /** Who opens each match; rematch flips this to cut first-move steamrolls. */
  startingPlayer: PlayerId;
  status: GameStatus;
  winner: PlayerId | null;
  winningLine: CellCoord[];
  /** The mark that completed the line — only this ball bounces. */
  winningCell: CellCoord | null;
  /** Most recently placed cell — drives the locked face highlight. */
  lastPlaced: CellCoord | null;
  /** Aiming cursor — always set while a game is in progress. */
  cursor: CellCoord;
  /** True while aiming (left-drag / touch / depth gesture); camera orbit paused. */
  aiming: boolean;
  /** Drop mode: cell key of the marker currently falling under physics. */
  fallingKey: string | null;
  /** Drop mode: block new places until the falling marker settles. */
  dropBusy: boolean;
  /**
   * Ordered keys animating in after a restore (staggered drop). Null when idle.
   * Kept stable until every ball settles — mutating mid-flight restarts delays.
   */
  restoreFallingKeys: string[] | null;
  /**
   * performance.now() when the scene began the restore drop-in clock.
   * Null while armed (`restoreFallingKeys` set) but the canvas has not started
   * framing yet — avoids skipping the whole stagger during WebGL mount.
   */
  restoreStartedAt: number | null;
  /** Date.now() when the current match began — drives vs-AI level time stats. */
  matchStartedAt: number | null;
  localName: string;
  playerNames: PlayerNames;
  roomId: string | null;
  seat: PlayerId | null;
  onlineStatus: OnlineStatus;
  rematchVotes: RematchVotes;
  opponentConnected: boolean;
  onlineError: string | null;
  setPresetId: (id: PresetId) => void;
  setPlayMode: (mode: PlayMode) => void;
  setPlacement: (placement: PlacementMode) => void;
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPowerUpsEnabled: (enabled: boolean) => void;
  setLocalName: (name: string) => void;
  setAiming: (aiming: boolean) => void;
  setCursor: (coord: CellCoord) => void;
  nudgeCursor: (dx: number, dy: number, dz: number) => void;
  startGame: () => void;
  /** Hydrate a matching local saved game and play staggered drop-in. */
  restoreGame: (saved: SavedGame) => void;
  /** Clear the board and swap who opens (local rematch). */
  rematch: () => void;
  returnToSetup: () => void;
  placeAtCursor: () => boolean;
  place: (coord: CellCoord) => boolean;
  applyRemotePlace: (coord: CellCoord, by: PlayerId) => boolean;
  finishDrop: () => void;
  /**
   * Stamp restoreStartedAt on the first scene frame after restore.
   * Idempotent — safe under React Strict remounts.
   */
  startRestoreClock: () => void;
  /** One restored ball finished its drop-in bounce. */
  finishRestoreBall: (key: string) => void;
  displayName: (player: PlayerId) => string;
  beginOnlineLobby: (roomId: string, seat: PlayerId, name: string) => void;
  startOnlineGame: (names: PlayerNames, presetId: PresetId, placement?: PlacementMode) => void;
  pauseOnline: () => void;
  resumeOnline: () => void;
  setOpponentConnected: (connected: boolean) => void;
  setOnlineError: (error: string | null) => void;
  setRematchVote: (seat: PlayerId, accept: boolean | null) => void;
  resetForRematch: () => void;
  leaveOnline: () => void;
  activatePowerUp: (kind: PowerUpId) => boolean;
  cancelPowerUpMode: () => void;
  /** End the turn after an ordinary place without spending Extra. */
  endTurn: () => boolean;
  setClearAxis: (axis: Axis) => void;
  cycleClearAxis: () => void;
  confirmClearRow: (a: number, b: number) => boolean;
  /** Clear confetti finished — apply pending board / remote sync. */
  finishClearBurst: () => void;
  /** Begin fall animation from the current tipped orientation. */
  confirmTip: () => boolean;
  /** Start fall after a tip lands (auto or Drop). */
  beginTipFall: () => void;
  setTipTargetEuler: (euler: TipEuler) => void;
  commitTipEuler: (euler: TipEuler) => void;
  finishTipFall: () => void;
  catchSwarmPackage: (index: number, by: PlayerId) => void;
  endSwarm: () => void;
  clearPowerUpToast: () => void;
  applyRemotePowerUpNotify: (
    kind: PowerUpId,
    by: PlayerId,
    phase: "activate" | "cancel" | "confirm",
  ) => void;
  applyRemoteClearAim: (msg: {
    by: PlayerId;
    active: boolean;
    clearAxis?: Axis;
    cursor?: CellCoord;
  }) => void;
  applyRemoteTipAim: (msg: { by: PlayerId; active: boolean; toDown?: TipDown | null }) => void;
  applyRemoteTipCommit: (msg: { by: PlayerId; tipEuler: TipEuler }) => void;
  applyRemoteSwarm: (plan: SwarmPlan) => void;
  applyRemoteSwarmResult: (
    by: PlayerId,
    index: number,
    outcome: SwarmTapOutcome,
    kind?: PowerUpId,
  ) => void;
  hydrateFromSnapshot: (snap: {
    board: Board;
    occupiedCount: number;
    currentPlayer: PlayerId;
    names: PlayerNames;
    presetId: PresetId;
    placement?: PlacementMode;
    status: GameStatus;
    winner: PlayerId | null;
    winningLine: CellCoord[];
    winningCell?: CellCoord | null;
    inventory?: PowerUpInventory;
    powerUpsEnabled?: boolean;
    bonusPlacesRemaining?: number;
    placedThisTurn?: boolean;
  }) => void;
};

let aiTimer: ReturnType<typeof setTimeout> | null = null;
let inventoryPulseTimer: ReturnType<typeof setTimeout> | null = null;
let inventoryPulseSeq = 0;
let clearBurstSeq = 0;
/** Keys that already reported settle for the current restore — survives Strict remounts. */
let restoreSettledKeys = new Set<string>();

type PendingClearSync = NonNullable<GameState["pendingClearSync"]>;

function snapshotToPendingClearSync(args: {
  board: Board;
  occupiedCount: number;
  currentPlayer: PlayerId;
  status: GameStatus;
  winner: PlayerId | null;
  winningLine: CellCoord[];
  winningCell: CellCoord | null;
  inventory: PowerUpInventory;
  bonusPlacesRemaining: number;
  placedThisTurn: boolean;
  onlineStatus: OnlineStatus;
}): PendingClearSync {
  return { ...args };
}

function startClearBurst(
  set: (partial: Partial<GameState>) => void,
  balls: ClearBurstBall[],
  extras: Partial<GameState> = {},
) {
  clearBurstSeq += 1;
  set({
    clearBurst: {
      id: clearBurstSeq,
      balls,
      startedAt: performance.now(),
    },
    powerUpMode: null,
    watchPowerUp: null,
    aiming: false,
    ...extras,
  });
}

function clearRestoreSession() {
  restoreSettledKeys = new Set();
}

function beginRestoreSession() {
  restoreSettledKeys = new Set();
}

function clearInventoryPulseTimer() {
  if (inventoryPulseTimer) {
    clearTimeout(inventoryPulseTimer);
    inventoryPulseTimer = null;
  }
}

function pulseInventoryAward(
  set: (partial: Partial<GameState>) => void,
  by: PlayerId,
  kind: PowerUpId,
) {
  clearInventoryPulseTimer();
  inventoryPulseSeq += 1;
  const id = inventoryPulseSeq;
  set({ inventoryPulse: { by, kind, id } });
  inventoryPulseTimer = setTimeout(() => {
    inventoryPulseTimer = null;
    set({ inventoryPulse: null });
  }, INVENTORY_PULSE_MS);
}

/** ponytail: session registers publisher; upgrade = explicit online middleware. */
let localPlacePublisher: ((coord: CellCoord, by: PlayerId) => void) | null = null;
let localSwarmPublisher: ((plan: SwarmPlan) => void) | null = null;
let localSwarmResultPublisher:
  | ((by: PlayerId, index: number, outcome: SwarmTapOutcome, kind?: PowerUpId) => void)
  | null = null;
let localStateSyncPublisher: (() => void) | null = null;
let localPowerUpNotifyPublisher:
  | ((kind: PowerUpId, by: PlayerId, phase: "activate" | "cancel" | "confirm") => void)
  | null = null;
let localClearAimPublisher:
  | ((msg: { by: PlayerId; active: boolean; clearAxis?: Axis; cursor?: CellCoord }) => void)
  | null = null;
let localTipAimPublisher:
  | ((msg: { by: PlayerId; active: boolean; toDown?: TipDown | null }) => void)
  | null = null;
let localTipCommitPublisher: ((msg: { by: PlayerId; tipEuler: TipEuler }) => void) | null = null;

export function setLocalPlacePublisher(
  fn: ((coord: CellCoord, by: PlayerId) => void) | null,
): void {
  localPlacePublisher = fn;
}

export function setLocalSwarmPublisher(fn: ((plan: SwarmPlan) => void) | null): void {
  localSwarmPublisher = fn;
}

export function setLocalSwarmResultPublisher(
  fn: ((by: PlayerId, index: number, outcome: SwarmTapOutcome, kind?: PowerUpId) => void) | null,
): void {
  localSwarmResultPublisher = fn;
}

export function setLocalStateSyncPublisher(fn: (() => void) | null): void {
  localStateSyncPublisher = fn;
}

export function setLocalPowerUpNotifyPublisher(
  fn: ((kind: PowerUpId, by: PlayerId, phase: "activate" | "cancel" | "confirm") => void) | null,
): void {
  localPowerUpNotifyPublisher = fn;
}

export function setLocalClearAimPublisher(
  fn:
    | ((msg: { by: PlayerId; active: boolean; clearAxis?: Axis; cursor?: CellCoord }) => void)
    | null,
): void {
  localClearAimPublisher = fn;
}

export function setLocalTipAimPublisher(
  fn: ((msg: { by: PlayerId; active: boolean; toDown?: TipDown | null }) => void) | null,
): void {
  localTipAimPublisher = fn;
}

export function setLocalTipCommitPublisher(
  fn: ((msg: { by: PlayerId; tipEuler: TipEuler }) => void) | null,
): void {
  localTipCommitPublisher = fn;
}

function publishClearAim(get: () => GameState) {
  const state = get();
  if (state.playMode !== "online" || state.powerUpMode !== "clear-row") return;
  const by = state.currentPlayer;
  if (state.seat !== by) return;
  localClearAimPublisher?.({
    by,
    active: true,
    clearAxis: state.clearAxis,
    cursor: state.cursor,
  });
}

function publishClearAimEnd(by: PlayerId) {
  localClearAimPublisher?.({ by, active: false });
}

function publishTipAim(get: () => GameState) {
  const state = get();
  if (state.playMode !== "online" || state.powerUpMode !== "tip") return;
  const by = state.currentPlayer;
  if (state.seat !== by) return;
  localTipAimPublisher?.({
    by,
    active: true,
    toDown: tipDownFromEuler(state.tipTargetEuler),
  });
}

function publishTipAimEnd(by: PlayerId) {
  localTipAimPublisher?.({ by, active: false });
}

function publishPowerUpNotify(
  kind: PowerUpId,
  by: PlayerId,
  phase: "activate" | "cancel" | "confirm",
) {
  localPowerUpNotifyPublisher?.(kind, by, phase);
}

function powerUpLabel(kind: PowerUpId): string {
  if (kind === "extra-turn") return "Extra turn";
  if (kind === "clear-row") return "Clear row";
  return "Tip field";
}

function clearAiTimer() {
  if (aiTimer !== null) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function clampCursor(coord: CellCoord, dims: { x: number; y: number; z: number }): CellCoord {
  return {
    x: Math.max(0, Math.min(dims.x - 1, coord.x)),
    y: Math.max(0, Math.min(dims.y - 1, coord.y)),
    z: Math.max(0, Math.min(dims.z - 1, coord.z)),
  };
}

/** Snap cursor Y to the drop landing (or top cell if the column is full). */
function snapDropCursor(
  coord: CellCoord,
  board: Board,
  dims: { x: number; y: number; z: number },
): CellCoord {
  const clamped = clampCursor(coord, dims);
  const land = dropLanding(board, dims, clamped.x, clamped.z);
  if (land) return land;
  return { x: clamped.x, y: dims.y - 1, z: clamped.z };
}

function scheduleAiMove(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  clearAiTimer();
  const thinkDelay = get().aiDifficulty === "extreme" ? 80 : AI_DELAY_MS;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    const state = get();
    if (state.status !== "playing" || state.playMode !== "ai") return;
    if (state.currentPlayer !== AI_PLAYER) return;
    // Tip playback / fall / clear confetti must finish before the AI places (or retries).
    if (
      state.dropBusy ||
      state.swarmBusy ||
      state.tipFalling ||
      state.watchTipPlayback ||
      state.clearBurst
    ) {
      scheduleAiMove(get, set);
      return;
    }
    if (state.restoreFallingKeys) {
      scheduleAiMove(get, set);
      return;
    }

    maybeAiSpendPowerUp(get, set);

    const afterSpend = get();
    if (afterSpend.currentPlayer !== AI_PLAYER || afterSpend.status !== "playing") return;
    // Tip starts rotate→fall playback; clear starts confetti — don't place now.
    if (afterSpend.watchTipPlayback || afterSpend.tipFalling || afterSpend.clearBurst) return;
    if (afterSpend.swarmBusy || afterSpend.dropBusy) {
      scheduleAiMove(get, set);
      return;
    }

    // After ordinary place: Extra declined → end turn (no second place).
    if (afterSpend.placedThisTurn && afterSpend.bonusPlacesRemaining === 0) {
      endTurnInternal(get, set);
      return;
    }

    const preset = getPreset(afterSpend.presetId);
    let move = pickAiMove(
      afterSpend.board,
      preset.dims,
      afterSpend.aiDifficulty,
      AI_PLAYER,
      afterSpend.occupiedCount,
      afterSpend.placement,
    );
    if (!move) return;

    // Bonus Extra place cannot finish — skip winning cells.
    if (afterSpend.bonusPlacesRemaining > 0) {
      if (wouldPlaceWin(afterSpend.board, preset.dims, move, AI_PLAYER, afterSpend.placement)) {
        const fallback = pickNonFinishingAiMove(
          afterSpend.board,
          preset.dims,
          afterSpend.placement,
          AI_PLAYER,
          afterSpend.aiDifficulty,
          afterSpend.occupiedCount,
        );
        if (!fallback) {
          // No safe Extra cell — refund and end turn.
          const awarded = awardPowerUp(afterSpend.inventory.b, "extra-turn");
          const inv = cloneInventory(afterSpend.inventory);
          if (awarded) inv.b = awarded;
          set({
            inventory: inv,
            bonusPlacesRemaining: 0,
            powerUpMode: null,
          });
          endTurnInternal(get, set);
          return;
        }
        move = fallback;
      }
    }

    applyPlace(get, set, move, AI_PLAYER);
    persistLocalGame(get());

    const afterPlace = get();
    if (
      afterPlace.status === "playing" &&
      afterPlace.currentPlayer === AI_PLAYER &&
      afterPlace.placedThisTurn &&
      !afterPlace.dropBusy
    ) {
      // Ordinary place kept the turn open for Extra — decide next beat.
      scheduleAiMove(get, set);
    }
  }, thinkDelay);
}

/** Prefer a strong non-finishing Extra place; used when the top pick would clinch. */
function pickNonFinishingAiMove(
  board: Board,
  dims: { x: number; y: number; z: number },
  placement: GameState["placement"],
  aiPlayer: PlayerId,
  difficulty: GameState["aiDifficulty"],
  occupiedCount: number,
): CellCoord | null {
  const move = pickAiMove(board, dims, difficulty, aiPlayer, occupiedCount, placement);
  if (move && !wouldPlaceWin(board, dims, move, aiPlayer, placement)) return move;

  const cells = placement === "drop" ? listDropLandings(board, dims) : listEmptyCells(board, dims);
  for (const cell of cells) {
    if (!wouldPlaceWin(board, dims, cell, aiPlayer, placement)) return cell;
  }
  return null;
}

/** AI spends banked power-ups with board-aware heuristics (not RNG). */
function maybeAiSpendPowerUp(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  const state = get();
  if (!state.powerUpsEnabled) return;
  const dims = getPreset(state.presetId).dims;

  const decision = pickAiPowerUpSpend({
    board: state.board,
    dims,
    aiPlayer: AI_PLAYER,
    inventory: state.inventory.b,
    placement: state.placement,
    difficulty: state.aiDifficulty,
    bonusPlacesRemaining: state.bonusPlacesRemaining,
    placedThisTurn: state.placedThisTurn,
    presetId: state.presetId,
  });

  if (decision.action === "extra-turn") {
    get().activatePowerUp("extra-turn");
    return;
  }

  if (decision.action === "clear-row") {
    const spent = spendPowerUp(state.inventory.b, "clear-row");
    if (!spent) return;
    const balls = planClearBurst(state.board, dims, decision.axis, decision.a, decision.b);
    let board = clearAxisLine(state.board, dims, decision.axis, decision.a, decision.b);
    if (state.placement === "drop") board = repackDrop(board, dims);
    const toast = `${get().displayName(AI_PLAYER)} cleared a row`;
    if (balls.length === 0) {
      finishPowerUpBoard(get, set, board, AI_PLAYER, spent, toast);
      return;
    }
    // Same staggered confetti as a human Clear — turn ends after VFX.
    startClearBurst(set, balls, {
      pendingClearFinish: { board, by: AI_PLAYER, spent, toast },
      pendingClearSync: null,
      powerUpToast: null,
    });
    return;
  }

  if (decision.action === "tip") {
    const tipEuler = eulerForTipDown(decision.toDown);
    // Same rotate → ball-drop playback as an online opponent commit.
    // Toast after settle (finishPowerUpBoard); status shows "{AI} tipping…" meanwhile.
    set({
      powerUpToast: null,
      watchPowerUp: null,
      watchTipPlayback: true,
      pendingTipSync: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...tipEuler },
      tipFalling: false,
      aiming: false,
    });
  }
}

/** Flip the seat after an ordinary place when Extra is declined. */
function endTurnInternal(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
): boolean {
  const state = get();
  if (state.status !== "playing" || state.phase !== "playing") return false;
  if (!state.placedThisTurn || state.bonusPlacesRemaining > 0) return false;
  if (state.dropBusy || state.swarmBusy || state.tipFalling || state.watchTipPlayback) {
    return false;
  }
  if (state.clearBurst) return false;

  const by = state.currentPlayer;
  const nextPlayer = opponentOf(by);
  const earner = state.pendingSwarmEarner ?? by;
  set({
    currentPlayer: nextPlayer,
    placedThisTurn: false,
    powerUpMode: null,
    pendingSwarmEarner: null,
    aiming: false,
  });

  maybeStartSwarm(get, set, earner);
  persistLocalGame(get());
  if (state.playMode === "online") {
    localStateSyncPublisher?.();
  }

  const after = get();
  if (!after.swarmBusy && after.playMode === "ai" && after.currentPlayer === AI_PLAYER) {
    scheduleAiMove(get, set);
  }
  return true;
}

function finishPowerUpBoard(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  board: Board,
  by: PlayerId,
  spentCounts: PowerUpInventory["a"],
  _toast?: string,
) {
  const state = get();
  const dims = getPreset(state.presetId).dims;
  const occupiedCount = board.size;
  const inv = cloneInventory(state.inventory);
  inv[by] = spentCounts;
  const win = checkWinAny(board, dims);
  const nextPlayer = opponentOf(by);

  const opponentToast = state.playMode === "ai" && by === AI_PLAYER && _toast ? _toast : null;

  const tipReset = {
    tipFalling: false,
    tipEuler: { ...IDENTITY_TIP_EULER },
    tipTargetEuler: { ...IDENTITY_TIP_EULER },
    tipCheckpoint: null,
    tipDirty: false,
  } as const;

  if (win) {
    set({
      board,
      occupiedCount,
      inventory: inv,
      status: "won",
      winner: win.winner,
      winningLine: win.line,
      winningCell: win.line[0] ?? null,
      powerUpMode: null,
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      powerUpToast: opponentToast,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
      ...tipReset,
    });
    recordAiMatchStats(get());
    if (state.playMode === "online") localStateSyncPublisher?.();
    else persistLocalGame(get());
    return;
  }

  if (isDraw(occupiedCount, dims)) {
    set({
      board,
      occupiedCount,
      inventory: inv,
      status: "draw",
      winner: null,
      winningLine: [],
      winningCell: null,
      powerUpMode: null,
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      powerUpToast: opponentToast,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
      ...tipReset,
    });
    recordAiMatchStats(get());
    if (state.playMode === "online") localStateSyncPublisher?.();
    else persistLocalGame(get());
    return;
  }

  set({
    board,
    occupiedCount,
    inventory: inv,
    currentPlayer: nextPlayer,
    status: "playing",
    winner: null,
    winningLine: [],
    winningCell: null,
    powerUpMode: null,
    bonusPlacesRemaining: 0,
    placedThisTurn: false,
    powerUpToast: opponentToast,
    watchPowerUp: null,
    watchTipPlayback: false,
    pendingTipSync: null,
    clearBurst: null,
    pendingClearFinish: null,
    pendingClearSync: null,
    fallingKey: null,
    dropBusy: false,
    ...tipReset,
  });

  if (state.playMode === "ai" && nextPlayer === AI_PLAYER) {
    scheduleAiMove(get, set);
  }
  if (state.playMode === "online") {
    localStateSyncPublisher?.();
  } else {
    persistLocalGame(get());
  }
}

function afterSwarm(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  const next = get();
  if (next.status === "playing" && next.playMode === "ai" && next.currentPlayer === AI_PLAYER) {
    scheduleAiMove(get, set);
  }
}

function maybeStartSwarm(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  earner: PlayerId,
) {
  const state = get();
  if (state.status !== "playing") return;
  if (state.playMode === "hotseat") return;
  if (state.swarmBusy || state.swarm) return;
  const seed = randomSeed();
  const rng = createPowerUpRng(seed);
  if (
    !shouldAttemptSwarm({
      powerUpsEnabled: state.powerUpsEnabled,
      occupiedCount: state.occupiedCount,
      cooldownUntilPly: state.swarmCooldownUntilPly,
      rng,
    })
  ) {
    return;
  }

  const plan = planSwarm(seed, earner, createPowerUpRng(seed ^ 0x9e3779b9));

  // vs AI: both race — AI taps a pre-aimed package after a reaction delay.
  let swarmAiResult: GameState["swarmAiResult"] = null;
  if (state.playMode === "ai") {
    const catchRng = createPowerUpRng(seed ^ 0x85ebca6b);
    swarmAiResult = { targetIndex: pickAiSwarmTarget(plan, catchRng) };
  }

  set({
    swarm: plan,
    swarmBusy: true,
    swarmPopped: {},
    swarmAiResult,
  });
  if (state.playMode === "online") {
    localSwarmPublisher?.(plan);
  }
}

function canExtendWithExtra(state: {
  powerUpsEnabled: boolean;
  playMode: PlayMode;
  presetId: PresetId;
  inventory: PowerUpInventory;
  currentPlayer: PlayerId;
}): boolean {
  // Hotseat has no power-up HUD — don't leave a stranded Extra window.
  if (state.playMode === "hotseat") return false;
  if (!state.powerUpsEnabled) return false;
  if (!isPowerUpAllowed("extra-turn", state.presetId)) return false;
  return canSpend(state.inventory[state.currentPlayer], "extra-turn");
}

function applyPlace(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  coord: CellCoord,
  player: PlayerId,
): boolean {
  const state = get();
  if (state.status !== "playing" || state.phase !== "playing") return false;
  if (state.playMode === "online" && state.onlineStatus === "paused") return false;
  if (state.dropBusy || state.swarmBusy || state.tipFalling) return false;
  if (state.clearBurst) return false;
  if (state.restoreFallingKeys) return false;
  if (state.powerUpMode === "clear-row" || state.powerUpMode === "tip") return false;
  // After ordinary place, must spend Extra (bonus) or endTurn — no free second ball.
  if (state.placedThisTurn && state.bonusPlacesRemaining === 0) return false;

  const preset = getPreset(state.presetId);
  const resolved = resolvePlaceCoord(state.board, preset.dims, coord, state.placement);
  if (!resolved) return false;

  const isBonusPlace = state.bonusPlacesRemaining > 0;
  // Extra ball cannot clinch the match.
  if (isBonusPlace && wouldPlaceWin(state.board, preset.dims, resolved, player, state.placement)) {
    set({ powerUpToast: EXTRA_NO_FINISH_TOAST });
    return false;
  }

  const key = cellKey(resolved.x, resolved.y, resolved.z);
  const nextBoard = new Map(state.board);
  nextBoard.set(key, player);
  const occupiedCount = state.occupiedCount + 1;
  const dropAnim = state.placement === "drop";

  const win = checkWin(nextBoard, preset.dims, resolved, player);
  if (win) {
    set({
      board: nextBoard,
      occupiedCount,
      status: "won",
      winner: win.winner,
      winningLine: win.line,
      winningCell: resolved,
      lastPlaced: resolved,
      cursor: resolved,
      aiming: false,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      powerUpMode: null,
      pendingSwarmEarner: null,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
    recordAiMatchStats(get());
    return true;
  }

  if (isDraw(occupiedCount, preset.dims)) {
    set({
      board: nextBoard,
      occupiedCount,
      status: "draw",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: resolved,
      cursor: resolved,
      aiming: false,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      powerUpMode: null,
      pendingSwarmEarner: null,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
    recordAiMatchStats(get());
    return true;
  }

  // Extra bonus place: consume bonus and flip.
  if (isBonusPlace) {
    const nextPlayer: PlayerId = player === "a" ? "b" : "a";
    const swarmEarner = state.pendingSwarmEarner ?? player;
    set({
      board: nextBoard,
      occupiedCount,
      currentPlayer: nextPlayer,
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: resolved,
      cursor: resolved,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      powerUpMode: null,
      pendingSwarmEarner: dropAnim ? swarmEarner : null,
      powerUpToast: null,
    });
    if (!dropAnim) {
      maybeStartSwarm(get, set, swarmEarner);
      const after = get();
      if (!after.swarmBusy && after.playMode === "ai" && after.currentPlayer === AI_PLAYER) {
        scheduleAiMove(get, set);
      }
    }
    return true;
  }

  // Ordinary first place — keep the turn open if Extra is banked.
  if (canExtendWithExtra({ ...state, currentPlayer: player })) {
    set({
      board: nextBoard,
      occupiedCount,
      currentPlayer: player,
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: resolved,
      cursor: resolved,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: 0,
      placedThisTurn: true,
      powerUpMode: null,
      pendingSwarmEarner: player,
      powerUpToast: null,
    });
    return true;
  }

  const nextPlayer: PlayerId = player === "a" ? "b" : "a";
  const swarmEarner = state.pendingSwarmEarner ?? player;
  set({
    board: nextBoard,
    occupiedCount,
    currentPlayer: nextPlayer,
    status: "playing",
    winner: null,
    winningLine: [],
    winningCell: null,
    lastPlaced: resolved,
    cursor: resolved,
    fallingKey: dropAnim ? key : null,
    dropBusy: dropAnim,
    powerUpMode: null,
    placedThisTurn: false,
    pendingSwarmEarner: dropAnim ? swarmEarner : null,
  });

  if (!dropAnim) {
    maybeStartSwarm(get, set, swarmEarner);
    const after = get();
    if (!after.swarmBusy && after.playMode === "ai" && after.currentPlayer === AI_PLAYER) {
      scheduleAiMove(get, set);
    }
  }

  return true;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: "setup",
  presetId: "4x4x4",
  playMode: "hotseat",
  placement: "free",
  aiDifficulty: "medium",
  powerUpsEnabled: true,
  inventory: emptyInventory(),
  bonusPlacesRemaining: 0,
  placedThisTurn: false,
  pendingSwarmEarner: null,
  swarm: null,
  swarmBusy: false,
  swarmPopped: {},
  powerUpMode: null,
  clearAxis: "x",
  powerUpToast: null,
  inventoryPulse: null,
  watchPowerUp: null,
  watchTipPlayback: false,
  pendingTipSync: null,
  clearBurst: null,
  pendingClearFinish: null,
  pendingClearSync: null,
  swarmAiResult: null,
  swarmCooldownUntilPly: 0,
  tipEuler: { ...IDENTITY_TIP_EULER },
  tipTargetEuler: { ...IDENTITY_TIP_EULER },
  tipFalling: false,
  tipCheckpoint: null,
  tipDirty: false,
  board: createEmptyBoard(),
  occupiedCount: 0,
  currentPlayer: "a",
  startingPlayer: "a",
  status: "playing",
  winner: null,
  winningLine: [],
  winningCell: null,
  lastPlaced: null,
  cursor: { x: 1, y: 1, z: 1 },
  aiming: false,
  fallingKey: null,
  dropBusy: false,
  restoreFallingKeys: null,
  restoreStartedAt: null,
  matchStartedAt: null,
  localName: "",
  playerNames: { ...EMPTY_NAMES },
  roomId: null,
  seat: null,
  onlineStatus: "idle",
  rematchVotes: { ...EMPTY_VOTES },
  opponentConnected: false,
  onlineError: null,

  setPresetId: (id) => {
    const presetId = resolvePresetId(id);
    const patch: Partial<GameState> = { presetId };
    // Extreme is only offered on boards larger than 3×3×3.
    if (presetId === "3x3x3" && get().aiDifficulty === "extreme") {
      patch.aiDifficulty = "hard";
    }
    set(patch);
    persistSetupPrefs(get());
  },
  setPlayMode: (mode) => {
    // Hotseat is pass-and-play only — no power-ups.
    if (mode === "hotseat") {
      set({ playMode: mode, powerUpsEnabled: false });
    } else {
      set({ playMode: mode });
    }
    persistSetupPrefs(get());
  },
  setPlacement: (placement) => {
    set({ placement });
    persistSetupPrefs(get());
  },
  setAiDifficulty: (difficulty) => {
    set({ aiDifficulty: difficulty });
    persistSetupPrefs(get());
  },
  setPowerUpsEnabled: (enabled) => {
    if (get().playMode === "hotseat") {
      set({ powerUpsEnabled: false });
    } else {
      set({ powerUpsEnabled: enabled });
    }
    persistSetupPrefs(get());
  },
  setLocalName: (name) => {
    const localName = name.slice(0, 16);
    persistLocalName(localName);
    set({ localName });
  },
  setAiming: (aiming) => set({ aiming }),
  setCursor: (coord) => {
    const state = get();
    if (state.swarmBusy || state.tipFalling || state.powerUpMode === "tip") return;
    const dims = getPreset(state.presetId).dims;
    // Clear mode: free 3D aim (no drop snap) so any axis line can be targeted.
    if (state.placement === "drop" && state.powerUpMode !== "clear-row") {
      set({ cursor: snapDropCursor(coord, state.board, dims) });
      publishClearAim(get);
      return;
    }
    set({ cursor: clampCursor(coord, dims) });
    publishClearAim(get);
  },

  nudgeCursor: (dx, dy, dz) => {
    const state = get();
    if (state.status !== "playing" || state.swarmBusy) return;
    if (state.tipFalling || state.powerUpMode === "tip") {
      return;
    }
    if (state.playMode === "online" && state.onlineStatus !== "playing") return;
    const dims = getPreset(state.presetId).dims;
    if (state.placement === "drop" && state.powerUpMode !== "clear-row") {
      set({
        cursor: snapDropCursor(
          {
            x: state.cursor.x + dx,
            y: state.cursor.y,
            z: state.cursor.z + dz + dy,
          },
          state.board,
          dims,
        ),
      });
      publishClearAim(get);
      return;
    }
    set({
      cursor: clampCursor(
        {
          x: state.cursor.x + dx,
          y: state.cursor.y + dy,
          z: state.cursor.z + dz,
        },
        dims,
      ),
    });
    publishClearAim(get);
  },

  displayName: (player) => {
    const name = get().playerNames[player].trim();
    return name || PLAYER_LABELS[player];
  },

  clearPowerUpToast: () => set({ powerUpToast: null }),

  setClearAxis: (axis) => {
    set({ clearAxis: axis });
    publishClearAim(get);
  },

  cycleClearAxis: () => {
    const state = get();
    if (state.powerUpMode !== "clear-row") return;
    set({ clearAxis: nextClearAxis(state.clearAxis) });
    publishClearAim(get);
  },

  activatePowerUp: (kind) => {
    const state = get();
    if (!state.powerUpsEnabled || state.status !== "playing" || state.phase !== "playing") {
      return false;
    }
    if (state.dropBusy || state.swarmBusy || state.tipFalling || state.watchTipPlayback) {
      return false;
    }
    if (state.clearBurst) return false;
    if (state.powerUpMode) return false;
    if (state.playMode === "online") {
      if (state.onlineStatus !== "playing") return false;
      if (state.seat == null || state.currentPlayer !== state.seat) return false;
    } else if (state.playMode === "ai" && state.currentPlayer === AI_PLAYER) {
      // Allowed — maybeAiSpendPowerUp drives AI extra-turn
    } else if (state.playMode === "ai" && state.currentPlayer !== HUMAN) {
      return false;
    }

    const by = state.currentPlayer;
    if (!isPowerUpAllowed(kind, state.presetId)) return false;
    if (!canSpend(state.inventory[by], kind)) return false;

    if (kind === "extra-turn") {
      // Must place an ordinary ball first; Extra only extends the turn.
      if (!state.placedThisTurn) return false;
      if (state.bonusPlacesRemaining > 0) return false;
      const spent = spendPowerUp(state.inventory[by], kind);
      if (!spent) return false;
      const inv = cloneInventory(state.inventory);
      inv[by] = spent;
      const aiToast =
        state.playMode === "ai" && by === AI_PLAYER
          ? `${state.displayName(by)} used ${powerUpLabel(kind)}`
          : null;
      set({
        inventory: inv,
        bonusPlacesRemaining: 1,
        powerUpMode: "extra-turn",
        powerUpToast: aiToast,
      });
      if (state.playMode === "online") {
        publishPowerUpNotify(kind, by, "activate");
        publishPowerUpNotify(kind, by, "confirm");
        localStateSyncPublisher?.();
      }
      return true;
    }

    // Clear / Tip replace the place — not after you've already placed.
    if (state.placedThisTurn) return false;

    if (kind === "tip") {
      const dims = getPreset(state.presetId).dims;
      if (!canTipPreset(dims)) {
        set({ powerUpToast: null });
        return false;
      }
      set({
        powerUpMode: "tip",
        tipEuler: { ...IDENTITY_TIP_EULER },
        tipTargetEuler: { ...IDENTITY_TIP_EULER },
        tipFalling: false,
        tipCheckpoint: new Map(state.board),
        tipDirty: false,
        aiming: false,
        powerUpToast: null,
      });
      if (state.playMode === "online") {
        publishPowerUpNotify(kind, by, "activate");
        publishTipAim(get);
      }
      return true;
    }

    set({
      powerUpMode: kind,
      powerUpToast: null,
    });
    if (state.playMode === "online") {
      publishPowerUpNotify(kind, by, "activate");
      publishClearAim(get);
    }
    return true;
  },

  cancelPowerUpMode: () => {
    const state = get();
    if (state.tipFalling) return;
    const mode = state.powerUpMode;
    const by = state.currentPlayer;
    if (mode === "extra-turn" && state.bonusPlacesRemaining > 0) {
      // Refund if no place has consumed the bonus yet; stay in Extra window.
      const awarded = awardPowerUp(state.inventory[by], "extra-turn");
      const inv = cloneInventory(state.inventory);
      if (awarded) inv[by] = awarded;
      set({
        inventory: inv,
        bonusPlacesRemaining: 0,
        powerUpMode: null,
        powerUpToast: null,
      });
      if (state.playMode === "online") {
        publishPowerUpNotify("extra-turn", by, "cancel");
        localStateSyncPublisher?.();
      }
      return;
    }
    if (mode === "tip" && state.tipCheckpoint) {
      if (state.playMode === "online") {
        publishPowerUpNotify("tip", by, "cancel");
        publishTipAimEnd(by);
      }
      set({
        board: state.tipCheckpoint,
        powerUpMode: null,
        tipEuler: { ...IDENTITY_TIP_EULER },
        tipTargetEuler: { ...IDENTITY_TIP_EULER },
        tipFalling: false,
        tipCheckpoint: null,
        tipDirty: false,
        powerUpToast: null,
        watchPowerUp: null,
        clearBurst: null,
        pendingClearFinish: null,
        pendingClearSync: null,
      });
      if (state.playMode === "online") localStateSyncPublisher?.();
      return;
    }
    if (mode === "clear-row" && state.playMode === "online") {
      publishPowerUpNotify("clear-row", by, "cancel");
      publishClearAimEnd(by);
    }
    set({
      powerUpMode: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      tipCheckpoint: null,
      tipDirty: false,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
    });
  },

  endTurn: () => {
    const state = get();
    if (state.playMode === "ai" && state.currentPlayer !== HUMAN) return false;
    if (state.playMode === "online") {
      if (state.onlineStatus !== "playing") return false;
      if (state.seat == null || state.currentPlayer !== state.seat) return false;
    }
    return endTurnInternal(get, set);
  },

  confirmClearRow: (a, b) => {
    const state = get();
    if (state.powerUpMode !== "clear-row" || state.status !== "playing") return false;
    if (state.dropBusy || state.swarmBusy || state.clearBurst) return false;
    const by = state.currentPlayer;
    if (state.playMode === "ai" && by !== HUMAN) return false;
    if (state.playMode === "online") {
      if (state.seat == null || by !== state.seat) return false;
    }
    const spent = spendPowerUp(state.inventory[by], "clear-row");
    if (!spent) return false;
    const dims = getPreset(state.presetId).dims;
    const balls = planClearBurst(state.board, dims, state.clearAxis, a, b);
    let board = clearAxisLine(state.board, dims, state.clearAxis, a, b);
    if (state.placement === "drop") board = repackDrop(board, dims);
    const label = state.displayName(by);
    const toast = `${label} cleared a row`;
    if (state.playMode === "online") {
      publishPowerUpNotify("clear-row", by, "confirm");
      // Keep spectator watchPowerUp until confirm handler starts the burst
      // (aim-end would wipe axis/cursor before the notify is handled).
    }
    if (balls.length === 0) {
      finishPowerUpBoard(get, set, board, by, spent, toast);
      return true;
    }
    // Keep pre-clear board visible; confetti pops each ball, then finish applies board.
    startClearBurst(set, balls, {
      pendingClearFinish: { board, by, spent, toast },
      pendingClearSync: null,
    });
    return true;
  },

  finishClearBurst: () => {
    const state = get();
    if (!state.clearBurst) return;

    const pendingFinish = state.pendingClearFinish;
    if (pendingFinish) {
      set({
        clearBurst: null,
        pendingClearFinish: null,
        pendingClearSync: null,
      });
      finishPowerUpBoard(
        get,
        set,
        pendingFinish.board,
        pendingFinish.by,
        pendingFinish.spent,
        pendingFinish.toast,
      );
      return;
    }

    const pending = state.pendingClearSync;
    if (pending) {
      set({
        board: pending.board,
        occupiedCount: pending.occupiedCount,
        currentPlayer: pending.currentPlayer,
        status: pending.status,
        winner: pending.winner,
        winningLine: pending.winningLine,
        winningCell: pending.winningCell,
        inventory: pending.inventory,
        bonusPlacesRemaining: pending.bonusPlacesRemaining,
        placedThisTurn: pending.placedThisTurn,
        onlineStatus: pending.onlineStatus,
        clearBurst: null,
        pendingClearFinish: null,
        pendingClearSync: null,
        powerUpMode: null,
        watchPowerUp: null,
        cursor:
          state.placement === "drop"
            ? snapDropCursor(
                centerCell(getPreset(state.presetId).dims),
                pending.board,
                getPreset(state.presetId).dims,
              )
            : centerCell(getPreset(state.presetId).dims),
      });
      return;
    }

    // VFX-only (e.g. remote toast path before sync) — just clear the overlay.
    set({ clearBurst: null, pendingClearFinish: null, pendingClearSync: null });
  },

  confirmTip: () => {
    const state = get();
    if (state.powerUpMode !== "tip" || state.status !== "playing") return false;
    if (state.dropBusy || state.swarmBusy || state.tipFalling || state.clearBurst) return false;
    const by = state.currentPlayer;
    if (state.playMode === "ai" && by !== HUMAN) return false;
    if (state.playMode === "online") {
      if (state.seat == null || by !== state.seat) return false;
    }
    const dims = getPreset(state.presetId).dims;
    if (!canTipPreset(dims)) return false;

    const locked = { ...state.tipTargetEuler };
    const toDown = tipDownFromEuler(locked);
    // Must actually tip off the current floor — then balls drop once on commit.
    if (toDown === "-y") return false;

    set({
      tipEuler: locked,
      tipTargetEuler: locked,
      tipFalling: true,
      powerUpToast: null,
      aiming: false,
    });
    if (state.playMode === "online") {
      localTipCommitPublisher?.({ by, tipEuler: locked });
    }
    return true;
  },

  beginTipFall: () => {
    const state = get();
    if (state.tipFalling) return;
    if (state.powerUpMode !== "tip" && !state.watchTipPlayback) return;
    const locked = { ...state.tipTargetEuler };
    if (tipDownFromEuler(locked) === "-y") return;
    set({
      tipEuler: locked,
      tipTargetEuler: locked,
      tipFalling: true,
      powerUpToast: null,
      aiming: false,
    });
  },

  setTipTargetEuler: (euler) => {
    const state = get();
    if (state.tipFalling) return;
    if (state.powerUpMode !== "tip") return;
    set({ tipTargetEuler: euler });
    if (state.playMode === "online") publishTipAim(get);
  },

  commitTipEuler: (euler) => {
    const state = get();
    if (state.tipFalling) return;
    if (state.powerUpMode !== "tip" && !state.watchTipPlayback) return;
    set({ tipEuler: euler, tipTargetEuler: euler });
    if (state.powerUpMode === "tip" && state.playMode === "online") publishTipAim(get);
  },

  finishTipFall: () => {
    const state = get();
    if (!state.tipFalling) return;
    const dims = getPreset(state.presetId).dims;
    const toDown = tipDownFromEuler(state.tipEuler);

    // Spectator / AI replay of a Tip commit — apply board (or pending sync) and exit.
    if (state.watchTipPlayback) {
      const pending = state.pendingTipSync;
      if (pending) {
        set({
          board: pending.board,
          occupiedCount: pending.occupiedCount,
          currentPlayer: pending.currentPlayer,
          status: pending.status,
          winner: pending.winner,
          winningLine: pending.winningLine,
          winningCell: pending.winningCell,
          inventory: pending.inventory,
          bonusPlacesRemaining: pending.bonusPlacesRemaining,
          placedThisTurn: pending.placedThisTurn,
          onlineStatus: pending.onlineStatus,
          tipFalling: false,
          tipEuler: { ...IDENTITY_TIP_EULER },
          tipTargetEuler: { ...IDENTITY_TIP_EULER },
          tipCheckpoint: null,
          tipDirty: false,
          watchTipPlayback: false,
          pendingTipSync: null,
          clearBurst: null,
          pendingClearFinish: null,
          pendingClearSync: null,
          watchPowerUp: null,
          powerUpMode: null,
        });
        return;
      }
      if (toDown === "-y") {
        set({
          tipFalling: false,
          tipEuler: { ...IDENTITY_TIP_EULER },
          tipTargetEuler: { ...IDENTITY_TIP_EULER },
          tipCheckpoint: null,
          tipDirty: false,
          watchTipPlayback: false,
          powerUpMode: null,
        });
        return;
      }
      const board = tipBoardFromEuler(state.board, dims, state.tipEuler);
      // AI tip: spend + hand off turn after the human has watched the fall.
      if (state.playMode === "ai" && state.currentPlayer === AI_PLAYER) {
        const spent = spendPowerUp(state.inventory[AI_PLAYER], "tip");
        if (!spent) {
          set({
            tipFalling: false,
            tipEuler: { ...IDENTITY_TIP_EULER },
            tipTargetEuler: { ...IDENTITY_TIP_EULER },
            tipCheckpoint: null,
            tipDirty: false,
            watchTipPlayback: false,
            powerUpMode: null,
          });
          return;
        }
        finishPowerUpBoard(
          get,
          set,
          board,
          AI_PLAYER,
          spent,
          `${get().displayName(AI_PLAYER)} tipped the field`,
        );
        return;
      }
      // Online spectator fallback if state sync never arrived.
      set({
        board,
        occupiedCount: board.size,
        tipFalling: false,
        tipEuler: { ...IDENTITY_TIP_EULER },
        tipTargetEuler: { ...IDENTITY_TIP_EULER },
        tipCheckpoint: null,
        tipDirty: false,
        watchTipPlayback: false,
        watchPowerUp: null,
        clearBurst: null,
        pendingClearFinish: null,
        pendingClearSync: null,
        powerUpMode: null,
      });
      return;
    }

    if (state.powerUpMode !== "tip") return;
    if (toDown === "-y") {
      set({
        tipFalling: false,
        tipEuler: { ...IDENTITY_TIP_EULER },
        tipTargetEuler: { ...IDENTITY_TIP_EULER },
        tipCheckpoint: null,
        tipDirty: false,
        powerUpMode: null,
      });
      return;
    }
    // One tip per spend: rebase via full Euler (includes yaw), spend, exit.
    // Single store update via finishPowerUpBoard — no intermediate frame that
    // could re-slerp toward the pre-commit tip pose.
    const board = tipBoardFromEuler(state.board, dims, state.tipEuler);
    const by = state.currentPlayer;
    const spent = spendPowerUp(state.inventory[by], "tip");
    if (!spent) {
      set({
        tipFalling: false,
        tipEuler: { ...IDENTITY_TIP_EULER },
        tipTargetEuler: { ...IDENTITY_TIP_EULER },
        tipCheckpoint: null,
        tipDirty: false,
        powerUpMode: null,
      });
      return;
    }
    if (state.playMode === "online") {
      publishPowerUpNotify("tip", by, "confirm");
      publishTipAimEnd(by);
    }
    finishPowerUpBoard(get, set, board, by, spent, `${state.displayName(by)} tipped the field`);
  },

  catchSwarmPackage: (index, by) => {
    const state = get();
    if (!state.swarm || !state.swarmBusy) return;
    const plan = state.swarm;
    if (state.swarmPopped[index]) return;
    if (state.playMode === "online" && state.seat !== by) return;
    if (state.playMode === "ai" && by !== HUMAN && by !== AI_PLAYER) return;

    // Dud — pop for everyone, swarm continues.
    if (index !== plan.liveIndex) {
      const swarmPopped = { ...state.swarmPopped, [index]: "dud" as const };
      set({ swarmPopped });
      if (state.playMode === "online") {
        localSwarmResultPublisher?.(by, index, "dud");
      }
      return;
    }

    // Live package — race over. Claim if catcher has room, else deny/sabotage.
    const kind = pickRandomKind(
      state.inventory[by],
      createPowerUpRng(plan.seed ^ 0xdeadbeef),
      state.presetId,
    );
    if (!kind || !hasInventoryRoom(state.inventory[by], state.presetId)) {
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped: raceEndPopped(plan, state.swarmPopped, "deny"),
        swarmAiResult: null,
        powerUpToast: null,
      });
      if (state.playMode === "online") {
        localSwarmResultPublisher?.(by, index, "deny");
      }
      afterSwarm(get, set);
      return;
    }

    const next = awardPowerUp(state.inventory[by], kind, state.presetId);
    if (!next) {
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped: raceEndPopped(plan, state.swarmPopped, "deny"),
        swarmAiResult: null,
        powerUpToast: null,
      });
      if (state.playMode === "online") {
        localSwarmResultPublisher?.(by, index, "deny");
      }
      afterSwarm(get, set);
      return;
    }

    const inv = cloneInventory(state.inventory);
    inv[by] = next;
    set({
      inventory: inv,
      swarm: null,
      swarmBusy: false,
      swarmPopped: raceEndPopped(plan, state.swarmPopped, "claim"),
      swarmAiResult: null,
      swarmCooldownUntilPly: state.occupiedCount + SWARM_COOLDOWN_PLIES,
      powerUpToast: null,
    });
    pulseInventoryAward(set, by, kind);
    if (state.playMode === "online") {
      localSwarmResultPublisher?.(by, index, "claim", kind);
    }
    afterSwarm(get, set);
  },

  endSwarm: () => {
    const state = get();
    if (!state.swarmBusy && !state.swarm) return;
    // Race already settled (claim/deny) or flyby timed out with no live hit.
    set({ swarm: null, swarmBusy: false, swarmAiResult: null, swarmPopped: {} });
    afterSwarm(get, set);
  },

  applyRemoteSwarm: (plan) => {
    set({ swarm: plan, swarmBusy: true, swarmPopped: {}, swarmAiResult: null });
  },

  applyRemotePowerUpNotify: (kind, by, phase) => {
    const state = get();
    if (state.seat === by) return;
    const name = state.displayName(by);
    const label = powerUpLabel(kind);
    if (phase === "activate") {
      set({
        powerUpToast: `${name} is using ${label}`,
        watchPowerUp:
          kind === "clear-row"
            ? {
                kind: "clear-row",
                by,
                clearAxis: state.clearAxis,
                cursor: { ...state.cursor },
              }
            : kind === "tip"
              ? { kind: "tip", by, toDown: null }
              : null,
      });
      return;
    }
    if (phase === "cancel") {
      set({
        powerUpToast: `${name} canceled ${label}`,
        watchPowerUp: null,
      });
      return;
    }
    if (phase === "confirm") {
      if (kind === "clear-row") {
        const watch = state.watchPowerUp?.kind === "clear-row" ? state.watchPowerUp : null;
        const dims = getPreset(state.presetId).dims;
        const axis = watch?.clearAxis ?? state.clearAxis;
        const cursor = watch?.cursor ?? state.cursor;
        const fixed = clearFixedFromCursor(axis, cursor);
        const balls = planClearBurst(state.board, dims, axis, fixed.a, fixed.b);
        if (balls.length > 0 && !state.clearBurst) {
          startClearBurst(set, balls, {
            powerUpToast: `${name} used ${label}`,
            pendingClearFinish: null,
          });
          return;
        }
      }
      set({
        powerUpToast: `${name} used ${label}`,
        // Tip confirm may arrive during rotate/fall playback — don't abort it.
        watchPowerUp: kind === "tip" && get().watchTipPlayback ? get().watchPowerUp : null,
      });
    }
  },

  applyRemoteClearAim: (msg) => {
    const state = get();
    if (state.seat === msg.by) return;
    // Don't abort an in-flight clear confetti (or wipe aim data mid-confirm).
    if (state.clearBurst) return;
    if (!msg.active) {
      set((s) => ({
        watchPowerUp: s.watchPowerUp?.kind === "clear-row" ? null : s.watchPowerUp,
      }));
      return;
    }
    if (!msg.clearAxis || !msg.cursor) return;
    set({
      watchPowerUp: {
        kind: "clear-row",
        by: msg.by,
        clearAxis: msg.clearAxis,
        cursor: msg.cursor,
      },
    });
  },

  applyRemoteTipAim: (msg) => {
    const state = get();
    if (state.seat === msg.by) return;
    if (state.watchTipPlayback) return;
    if (!msg.active) {
      set((s) => ({
        watchPowerUp: s.watchPowerUp?.kind === "tip" ? null : s.watchPowerUp,
      }));
      return;
    }
    set({
      watchPowerUp: {
        kind: "tip",
        by: msg.by,
        toDown: msg.toDown ?? null,
      },
    });
  },

  applyRemoteTipCommit: (msg) => {
    const state = get();
    if (state.seat === msg.by) return;
    const name = state.displayName(msg.by);
    set({
      powerUpToast: `${name} tipped the field`,
      watchPowerUp: null,
      watchTipPlayback: true,
      pendingTipSync: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...msg.tipEuler },
      tipFalling: false,
      aiming: false,
    });
  },

  applyRemoteSwarmResult: (by, index, outcome, kind) => {
    const state = get();
    if (!state.swarmBusy && !state.swarm) return;
    if (state.swarmPopped[index]) return;

    if (outcome === "dud") {
      set({ swarmPopped: { ...state.swarmPopped, [index]: "dud" } });
      return;
    }

    if (outcome === "deny") {
      const plan = state.swarm;
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped: plan
          ? raceEndPopped(plan, state.swarmPopped, "deny")
          : { ...state.swarmPopped, [index]: "deny" },
        swarmAiResult: null,
        powerUpToast: null,
      });
      afterSwarm(get, set);
      return;
    }

    // claim
    if (kind) {
      const next = awardPowerUp(state.inventory[by], kind, state.presetId);
      if (next) {
        const inv = cloneInventory(state.inventory);
        inv[by] = next;
        const plan = state.swarm;
        set({
          inventory: inv,
          swarm: null,
          swarmBusy: false,
          swarmPopped: plan
            ? raceEndPopped(plan, state.swarmPopped, "claim")
            : { ...state.swarmPopped, [index]: "claim" },
          swarmAiResult: null,
          swarmCooldownUntilPly: state.occupiedCount + SWARM_COOLDOWN_PLIES,
          powerUpToast: null,
        });
        pulseInventoryAward(set, by, kind);
        afterSwarm(get, set);
        return;
      }
    }
    {
      const plan = state.swarm;
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped: plan
          ? raceEndPopped(plan, state.swarmPopped, "deny")
          : { ...state.swarmPopped, [index]: "deny" },
        swarmAiResult: null,
        powerUpToast: null,
      });
    }
    afterSwarm(get, set);
  },

  startGame: () => {
    clearAiTimer();
    clearInventoryPulseTimer();
    clearSavedGameFromStorage();
    clearRestoreSession();
    const state = get();
    const dims = getPreset(state.presetId).dims;
    const placement = state.placement;
    const hotseat = state.playMode === "hotseat";
    const powerUpsEnabled = hotseat ? false : state.powerUpsEnabled;
    const startCursor =
      placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    const playerNames =
      state.playMode === "ai" ? nextVsAiNames() : hotseat ? { ...EMPTY_NAMES } : state.playerNames;
    set({
      phase: "playing",
      board: createEmptyBoard(),
      occupiedCount: 0,
      startingPlayer: "a",
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      powerUpsEnabled,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      playerNames,
      matchStartedAt: Date.now(),
    });
  },

  restoreGame: (saved) => {
    clearAiTimer();
    clearInventoryPulseTimer();
    const dims = getPreset(saved.presetId).dims;
    const board: Board = new Map(saved.board);
    const hotseat = saved.playMode === "hotseat";
    const powerUpsEnabled = hotseat ? false : saved.powerUpsEnabled;
    const restoreKeys = restoreDropOrder(board);
    const startCursor =
      saved.placement === "drop" ? snapDropCursor(centerCell(dims), board, dims) : centerCell(dims);
    const animating = restoreKeys.length > 0;
    if (animating) beginRestoreSession();
    else clearRestoreSession();
    const playerNames =
      saved.playMode === "ai" ? nextVsAiNames() : hotseat ? { ...EMPTY_NAMES } : get().playerNames;
    set({
      phase: "playing",
      playMode: saved.playMode,
      presetId: saved.presetId,
      placement: saved.placement,
      aiDifficulty: saved.aiDifficulty,
      powerUpsEnabled,
      board,
      occupiedCount: saved.occupiedCount,
      startingPlayer: saved.startingPlayer,
      currentPlayer: saved.currentPlayer,
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: animating,
      restoreFallingKeys: animating ? restoreKeys : null,
      // Clock starts on first PhysicsMarkers frame — not here — so WebGL mount
      // latency cannot skip the staggered drop-in.
      restoreStartedAt: null,
      inventory: cloneInventory(saved.inventory),
      bonusPlacesRemaining: saved.bonusPlacesRemaining,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      tipCheckpoint: null,
      tipDirty: false,
      playerNames,
      matchStartedAt: Date.now(),
    });
    if (!animating) {
      const next = get();
      if (next.playMode === "ai" && next.currentPlayer === AI_PLAYER) {
        scheduleAiMove(get, set);
      }
    }
  },

  rematch: () => {
    clearAiTimer();
    clearInventoryPulseTimer();
    clearSavedGameFromStorage();
    const state = get();
    const dims = getPreset(state.presetId).dims;
    const nextStarter = opponentOf(state.startingPlayer);
    const hotseat = state.playMode === "hotseat";
    const powerUpsEnabled = hotseat ? false : state.powerUpsEnabled;
    const startCursor =
      state.placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    const playerNames =
      state.playMode === "ai" ? nextVsAiNames() : hotseat ? { ...EMPTY_NAMES } : state.playerNames;
    set({
      phase: "playing",
      board: createEmptyBoard(),
      occupiedCount: 0,
      startingPlayer: nextStarter,
      currentPlayer: nextStarter,
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      powerUpsEnabled,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      playerNames,
      matchStartedAt: Date.now(),
    });
    if (state.playMode === "ai" && nextStarter === AI_PLAYER) {
      scheduleAiMove(get, set);
    }
  },

  returnToSetup: () => {
    clearAiTimer();
    clearInventoryPulseTimer();
    const state = get();
    if (state.playMode === "hotseat" || state.playMode === "ai") {
      persistLocalGame(state);
    }
    set({
      phase: "setup",
      board: createEmptyBoard(),
      occupiedCount: 0,
      startingPlayer: "a",
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      roomId: null,
      seat: null,
      onlineStatus: "idle",
      playerNames: { ...EMPTY_NAMES },
      rematchVotes: { ...EMPTY_VOTES },
      opponentConnected: false,
      onlineError: null,
      matchStartedAt: null,
    });
  },

  beginOnlineLobby: (roomId, seat, name) => {
    const names: PlayerNames = { ...EMPTY_NAMES, [seat]: name };
    persistLocalName(name);
    set({
      phase: "lobby",
      playMode: "online",
      roomId,
      seat,
      localName: name,
      playerNames: names,
      onlineStatus: "lobby",
      opponentConnected: false,
      onlineError: null,
      rematchVotes: { ...EMPTY_VOTES },
    });
  },

  startOnlineGame: (names, presetId, placement) => {
    const resolved = resolvePresetId(presetId);
    const dims = getPreset(resolved).dims;
    const mode = placement ?? get().placement;
    const startCursor =
      mode === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    set({
      phase: "playing",
      playMode: "online",
      presetId: resolved,
      placement: mode,
      playerNames: names,
      board: createEmptyBoard(),
      occupiedCount: 0,
      startingPlayer: "a",
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      onlineStatus: "playing",
      opponentConnected: true,
      rematchVotes: { ...EMPTY_VOTES },
      onlineError: null,
      matchStartedAt: Date.now(),
    });
  },

  pauseOnline: () => {
    const state = get();
    if (state.playMode !== "online") return;
    if (state.onlineStatus !== "playing" && state.onlineStatus !== "ended") return;
    set({ onlineStatus: "paused", opponentConnected: false });
  },

  resumeOnline: () => {
    const state = get();
    if (state.playMode !== "online" || state.onlineStatus !== "paused") return;
    const next: OnlineStatus =
      state.status === "won" || state.status === "draw" ? "ended" : "playing";
    set({ onlineStatus: next, opponentConnected: true });
  },

  setOpponentConnected: (connected) => set({ opponentConnected: connected }),
  setOnlineError: (error) => set({ onlineError: error }),
  setRematchVote: (seat, accept) => {
    const votes = { ...get().rematchVotes, [seat]: accept };
    set({ rematchVotes: votes });
  },

  resetForRematch: () => {
    const state = get();
    clearInventoryPulseTimer();
    const dims = getPreset(state.presetId).dims;
    const nextStarter = opponentOf(state.startingPlayer);
    const startCursor =
      state.placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    set({
      board: createEmptyBoard(),
      occupiedCount: 0,
      startingPlayer: nextStarter,
      currentPlayer: nextStarter,
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      onlineStatus: "playing",
      rematchVotes: { ...EMPTY_VOTES },
      matchStartedAt: Date.now(),
    });
  },

  leaveOnline: () => {
    clearAiTimer();
    clearInventoryPulseTimer();
    localPlacePublisher = null;
    localSwarmPublisher = null;
    localSwarmResultPublisher = null;
    localStateSyncPublisher = null;
    localPowerUpNotifyPublisher = null;
    localClearAimPublisher = null;
    localTipAimPublisher = null;
    localTipCommitPublisher = null;
    set({
      phase: "setup",
      board: createEmptyBoard(),
      occupiedCount: 0,
      startingPlayer: "a",
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      lastPlaced: null,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      placedThisTurn: false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      inventoryPulse: null,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      roomId: null,
      seat: null,
      onlineStatus: "idle",
      playerNames: { ...EMPTY_NAMES },
      rematchVotes: { ...EMPTY_VOTES },
      opponentConnected: false,
    });
  },

  hydrateFromSnapshot: (snap) => {
    const resolved = resolvePresetId(snap.presetId);
    const dims = getPreset(resolved).dims;
    const placement = snap.placement ?? get().placement;
    const onlineStatus: OnlineStatus =
      snap.status === "won" || snap.status === "draw" ? "ended" : "playing";
    const inventory = snap.inventory ?? emptyInventory();

    // During spectator tip / clear playback, hold the authoritative board until VFX settles.
    if (get().watchTipPlayback) {
      set({
        phase: "playing",
        playMode: "online",
        playerNames: snap.names,
        presetId: resolved,
        placement,
        inventory,
        powerUpsEnabled: snap.powerUpsEnabled ?? get().powerUpsEnabled,
        pendingTipSync: {
          board: snap.board,
          occupiedCount: snap.occupiedCount,
          currentPlayer: snap.currentPlayer,
          status: snap.status,
          winner: snap.winner,
          winningLine: snap.winningLine,
          winningCell: snap.winningCell ?? null,
          inventory,
          bonusPlacesRemaining: snap.bonusPlacesRemaining ?? 0,
          placedThisTurn: snap.placedThisTurn ?? false,
          onlineStatus,
        },
        pendingSwarmEarner: null,
        swarm: null,
        swarmBusy: false,
        swarmPopped: {},
        swarmAiResult: null,
        swarmCooldownUntilPly: 0,
        powerUpMode: null,
        opponentConnected: true,
      });
      return;
    }

    if (get().clearBurst) {
      set({
        phase: "playing",
        playMode: "online",
        playerNames: snap.names,
        presetId: resolved,
        placement,
        inventory,
        powerUpsEnabled: snap.powerUpsEnabled ?? get().powerUpsEnabled,
        pendingClearSync: snapshotToPendingClearSync({
          board: snap.board,
          occupiedCount: snap.occupiedCount,
          currentPlayer: snap.currentPlayer,
          status: snap.status,
          winner: snap.winner,
          winningLine: snap.winningLine,
          winningCell: snap.winningCell ?? null,
          inventory,
          bonusPlacesRemaining: snap.bonusPlacesRemaining ?? 0,
          placedThisTurn: snap.placedThisTurn ?? false,
          onlineStatus,
        }),
        pendingSwarmEarner: null,
        swarm: null,
        swarmBusy: false,
        swarmPopped: {},
        swarmAiResult: null,
        swarmCooldownUntilPly: 0,
        powerUpMode: null,
        watchPowerUp: null,
        opponentConnected: true,
      });
      return;
    }

    set({
      phase: "playing",
      playMode: "online",
      board: snap.board,
      occupiedCount: snap.occupiedCount,
      currentPlayer: snap.currentPlayer,
      playerNames: snap.names,
      presetId: resolved,
      placement,
      status: snap.status,
      winner: snap.winner,
      winningLine: snap.winningLine,
      winningCell: snap.winningCell ?? null,
      lastPlaced: null,
      inventory,
      powerUpsEnabled: snap.powerUpsEnabled ?? get().powerUpsEnabled,
      bonusPlacesRemaining: snap.bonusPlacesRemaining ?? 0,
      placedThisTurn: snap.placedThisTurn ?? false,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      swarmAiResult: null,
      swarmCooldownUntilPly: 0,
      powerUpMode: null,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      clearBurst: null,
      pendingClearFinish: null,
      pendingClearSync: null,
      powerUpToast: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      tipCheckpoint: null,
      tipDirty: false,
      cursor:
        placement === "drop"
          ? snapDropCursor(centerCell(dims), snap.board, dims)
          : centerCell(dims),
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      restoreFallingKeys: null,
      restoreStartedAt: null,
      onlineStatus,
      opponentConnected: true,
    });
  },

  placeAtCursor: () => {
    const state = get();
    // Extra window: Place/Space spends Extra and drops the bonus ball at the
    // aimed cell. Ending the turn without Extra is only via Done — mapping
    // Place→endTurn made players miss their intended Extra cell.
    if (state.placedThisTurn && state.bonusPlacesRemaining === 0) {
      if (
        canExtendWithExtra({
          powerUpsEnabled: state.powerUpsEnabled,
          playMode: state.playMode,
          presetId: state.presetId,
          inventory: state.inventory,
          currentPlayer: state.currentPlayer,
        })
      ) {
        const preset = getPreset(state.presetId);
        const resolved = resolvePlaceCoord(state.board, preset.dims, state.cursor, state.placement);
        // Don't spend Extra on an illegal / occupied aim — keep the window open.
        if (!resolved) return false;
        if (
          wouldPlaceWin(state.board, preset.dims, resolved, state.currentPlayer, state.placement)
        ) {
          set({ powerUpToast: EXTRA_NO_FINISH_TOAST });
          return false;
        }
        if (!get().activatePowerUp("extra-turn")) return false;
        return get().place(resolved);
      }
      return state.endTurn();
    }
    return state.place(state.cursor);
  },

  place: (coord) => {
    const state = get();
    if (state.status !== "playing") return false;
    if (state.dropBusy || state.swarmBusy || state.tipFalling) return false;
    if (state.restoreFallingKeys) return false;
    if (state.watchTipPlayback || state.clearBurst) return false;
    if (state.powerUpMode === "clear-row" || state.powerUpMode === "tip") return false;
    if (state.playMode === "ai" && state.currentPlayer !== HUMAN) return false;
    if (state.playMode === "online") {
      if (state.onlineStatus !== "playing") return false;
      if (state.seat == null || state.currentPlayer !== state.seat) return false;
    }
    const by = state.currentPlayer;
    const ok = applyPlace(get, set, coord, by);
    if (ok) persistLocalGame(get());
    if (ok && state.playMode === "online") {
      const landed = get().cursor;
      localPlacePublisher?.(landed, by);
    }
    return ok;
  },

  applyRemotePlace: (coord, by) => {
    const state = get();
    if (state.playMode !== "online") return false;
    if (state.currentPlayer !== by) return false;
    return applyPlace(get, set, coord, by);
  },

  finishDrop: () => {
    const state = get();
    if (!state.dropBusy && state.fallingKey == null) return;
    if (state.restoreFallingKeys) return;
    const earner = state.pendingSwarmEarner;
    const dims = getPreset(state.presetId).dims;
    // Leave the settled ball — snap aim to the next free cell in that column
    // (or stay on top if full) so the selection box never frames a placed sphere.
    const cursor =
      state.placement === "drop" ? snapDropCursor(state.cursor, state.board, dims) : state.cursor;
    set({ dropBusy: false, fallingKey: null, pendingSwarmEarner: null, cursor });
    if (earner && get().status === "playing" && get().bonusPlacesRemaining === 0) {
      // Only swarm when the turn has flipped (earner !== current) or was a normal place
      const cur = get().currentPlayer;
      if (cur !== earner) {
        maybeStartSwarm(get, set, earner);
      }
    }
    const next = get();
    if (
      next.status === "playing" &&
      next.playMode === "ai" &&
      next.currentPlayer === AI_PLAYER &&
      !next.swarmBusy
    ) {
      scheduleAiMove(get, set);
    }
  },

  startRestoreClock: () => {
    const state = get();
    if (!state.restoreFallingKeys || state.restoreFallingKeys.length === 0) return;
    if (state.restoreStartedAt != null) return;
    set({ restoreStartedAt: performance.now() });
  },

  finishRestoreBall: (key) => {
    const state = get();
    const keys = state.restoreFallingKeys;
    if (!keys || keys.length === 0) return;
    if (restoreSettledKeys.has(key)) return;
    restoreSettledKeys.add(key);
    // Keep restoreFallingKeys stable until the last ball lands — shrinking the
    // list reshuffles stagger delays and restarts every remaining marker.
    if (restoreSettledKeys.size < keys.length) return;
    clearRestoreSession();
    set({ restoreFallingKeys: null, restoreStartedAt: null, dropBusy: false });
    const next = get();
    if (
      next.status === "playing" &&
      next.playMode === "ai" &&
      next.currentPlayer === AI_PLAYER &&
      !next.swarmBusy
    ) {
      scheduleAiMove(get, set);
    }
  },
}));

/** Call once on mount of setup/join screens (avoids SSR mismatch). */
export function hydrateLocalNameFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(LOCAL_NAME_KEY)?.slice(0, 16) ?? "";
    if (stored && useGameStore.getState().localName !== stored) {
      useGameStore.setState({ localName: stored });
    }
  } catch {
    // ignore
  }
}

/** Restore Mode / Placement / Preset / Difficulty — URL wins over localStorage. */
export function hydrateSetupFromStorage() {
  if (typeof window === "undefined") return;
  const fromStorage = readSetupPrefsFromStorage();
  const fromUrl = readSetupPrefsFromUrl();
  const prefs: Partial<SetupPrefs> = { ...fromStorage, ...fromUrl };
  if (Object.keys(prefs).length > 0) {
    useGameStore.setState(prefs);
  }

  const state = useGameStore.getState();
  const normalized: Partial<SetupPrefs> = {};
  if (state.playMode === "hotseat" && state.powerUpsEnabled) {
    normalized.powerUpsEnabled = false;
  }
  if (state.aiDifficulty === "extreme" && state.presetId === "3x3x3") {
    normalized.aiDifficulty = "hard";
  }
  if (Object.keys(normalized).length > 0) {
    useGameStore.setState(normalized);
  }
  persistSetupPrefs(useGameStore.getState());
}
