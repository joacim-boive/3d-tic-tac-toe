import { create } from "zustand";
import { pickAiMove } from "./ai";
import {
  cellKey,
  checkWin,
  checkWinAny,
  createEmptyBoard,
  dropLanding,
  isDraw,
  resolvePlaceCoord,
  type Board,
} from "./board";
import { clearAxisLine, nextClearAxis, repackDrop, type Axis } from "./clearRow";
import { getPreset, resolvePresetId } from "./presets";
import {
  aiCatchRoll,
  awardPowerUp,
  canSpend,
  cloneInventory,
  createPowerUpRng,
  emptyInventory,
  fullInventory,
  hasInventoryRoom,
  pickRandomKind,
  planSwarm,
  randomSeed,
  shouldAttemptSwarm,
  spendPowerUp,
  type PowerUpId,
  type PowerUpInventory,
  type SwarmPlan,
  type SwarmTapOutcome,
} from "./powerUps";
import { readSetupPrefsFromStorage, writeSetupPrefsToStorage, type SetupPrefs } from "./setupPrefs";
import {
  IDENTITY_TIP_EULER,
  canTipPreset,
  tipBoard,
  tipBoardFromEuler,
  tipChoices,
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
const HUMAN: PlayerId = "a";
const AI_PLAYER: PlayerId = "b";
const LOCAL_NAME_KEY = "voxel-toe-name";

const EMPTY_NAMES: PlayerNames = { a: "", b: "" };
const EMPTY_VOTES: RematchVotes = { a: null, b: null };

export type PowerUpMode = PowerUpId | null;

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
  /** Extra places left after the next place (1 = place twice total). */
  bonusPlacesRemaining: number;
  /** Player who earned the pending swarm (for post-extra-turn deferral). */
  pendingSwarmEarner: PlayerId | null;
  swarm: SwarmPlan | null;
  swarmBusy: boolean;
  /** Local + remote pops during a competitive flyby. */
  swarmPopped: Record<number, SwarmTapOutcome>;
  powerUpMode: PowerUpMode;
  clearAxis: Axis;
  powerUpToast: string | null;
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
    onlineStatus: OnlineStatus;
  } | null;
  /** Precomputed AI catch attempt if the human never taps the live package. */
  swarmAiResult: { caught: boolean; kind?: PowerUpId } | null;
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
  /** Aiming cursor — always set while a game is in progress. */
  cursor: CellCoord;
  /** True while Shift is held (aim mode; camera orbit paused). */
  aiming: boolean;
  /** Drop mode: cell key of the marker currently falling under physics. */
  fallingKey: string | null;
  /** Drop mode: block new places until the falling marker settles. */
  dropBusy: boolean;
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
  /** Clear the board and swap who opens (local rematch). */
  rematch: () => void;
  returnToSetup: () => void;
  placeAtCursor: () => boolean;
  place: (coord: CellCoord) => boolean;
  applyRemotePlace: (coord: CellCoord, by: PlayerId) => boolean;
  finishDrop: () => void;
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
  setClearAxis: (axis: Axis) => void;
  cycleClearAxis: () => void;
  confirmClearRow: (a: number, b: number) => boolean;
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
  applyRemoteTipAim: (msg: {
    by: PlayerId;
    active: boolean;
    toDown?: TipDown | null;
  }) => void;
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
  }) => void;
};

let aiTimer: ReturnType<typeof setTimeout> | null = null;

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
  | ((msg: {
      by: PlayerId;
      active: boolean;
      clearAxis?: Axis;
      cursor?: CellCoord;
    }) => void)
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
    | ((msg: {
        by: PlayerId;
        active: boolean;
        clearAxis?: Axis;
        cursor?: CellCoord;
      }) => void)
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
    if (state.dropBusy || state.swarmBusy) {
      scheduleAiMove(get, set);
      return;
    }

    maybeAiSpendPowerUp(get, set);

    const afterSpend = get();
    if (afterSpend.currentPlayer !== AI_PLAYER || afterSpend.status !== "playing") return;
    if (afterSpend.swarmBusy || afterSpend.dropBusy) {
      scheduleAiMove(get, set);
      return;
    }

    const preset = getPreset(afterSpend.presetId);
    const move = pickAiMove(
      afterSpend.board,
      preset.dims,
      afterSpend.aiDifficulty,
      AI_PLAYER,
      afterSpend.occupiedCount,
      afterSpend.placement,
    );
    if (!move) return;

    applyPlace(get, set, move, AI_PLAYER);
  }, thinkDelay);
}

/** AI may spend a banked power-up before placing (simple luck heuristics). */
function maybeAiSpendPowerUp(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
) {
  const state = get();
  if (!state.powerUpsEnabled) return;
  const counts = state.inventory.b;
  const rng = createPowerUpRng(randomSeed() ^ (state.occupiedCount * 997));

  if (canSpend(counts, "extra-turn") && state.bonusPlacesRemaining === 0 && rng() < 0.28) {
    get().activatePowerUp("extra-turn");
    return;
  }

  const dims = getPreset(state.presetId).dims;
  if (canSpend(counts, "clear-row") && rng() < 0.12) {
    const spent = spendPowerUp(counts, "clear-row");
    if (!spent) return;
    const axis: Axis = (["x", "y", "z"] as const)[Math.floor(rng() * 3)]!;
    const aMax = axis === "x" ? dims.y : axis === "y" ? dims.x : dims.x;
    const bMax = axis === "x" ? dims.z : axis === "y" ? dims.z : dims.y;
    const a = Math.floor(rng() * aMax);
    const b = Math.floor(rng() * bMax);
    let board = clearAxisLine(state.board, dims, axis, a, b);
    if (state.placement === "drop") board = repackDrop(board, dims);
    finishPowerUpBoard(get, set, board, AI_PLAYER, spent, "Cyan cleared a row");
    return;
  }

  if (canSpend(counts, "tip") && canTipPreset(dims) && rng() < 0.1) {
    const spent = spendPowerUp(counts, "tip");
    if (!spent) return;
    const choices = tipChoices();
    const toDown = choices[Math.floor(rng() * choices.length)]!;
    const board = tipBoard(state.board, dims, toDown);
    finishPowerUpBoard(get, set, board, AI_PLAYER, spent, "Cyan tipped the field");
  }
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

  const opponentToast =
    state.playMode === "ai" && by === AI_PLAYER && _toast ? _toast : null;

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
      powerUpToast: opponentToast,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
    if (state.playMode === "online") localStateSyncPublisher?.();
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
      powerUpToast: opponentToast,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
    if (state.playMode === "online") localStateSyncPublisher?.();
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
    powerUpToast: opponentToast,
    watchPowerUp: null,
    watchTipPlayback: false,
    pendingTipSync: null,
    fallingKey: null,
    dropBusy: false,
  });

  if (state.playMode === "ai" && nextPlayer === AI_PLAYER) {
    scheduleAiMove(get, set);
  }
  if (state.playMode === "online") {
    localStateSyncPublisher?.();
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
      rng,
    })
  ) {
    return;
  }

  const plan = planSwarm(seed, earner, createPowerUpRng(seed ^ 0x9e3779b9));

  // vs AI: human may claim or deny; if they never hit the live pack, AI rolls luck on timeout.
  let swarmAiResult: GameState["swarmAiResult"] = null;
  if (state.playMode === "ai") {
    const catchRng = createPowerUpRng(seed ^ 0x85ebca6b);
    const caught = aiCatchRoll(catchRng);
    let kind: PowerUpId | undefined;
    if (caught) {
      kind = pickRandomKind(state.inventory.b, catchRng) ?? undefined;
    }
    swarmAiResult = { caught: Boolean(caught && kind), kind };
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
  if (state.powerUpMode === "clear-row" || state.powerUpMode === "tip") return false;

  const preset = getPreset(state.presetId);
  const resolved = resolvePlaceCoord(state.board, preset.dims, coord, state.placement);
  if (!resolved) return false;

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
      cursor: resolved,
      aiming: false,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: 0,
      powerUpMode: null,
      pendingSwarmEarner: null,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
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
      cursor: resolved,
      aiming: false,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: 0,
      powerUpMode: null,
      pendingSwarmEarner: null,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
    return true;
  }

  // Extra turn: skip flip while bonus remains
  if (state.bonusPlacesRemaining > 0) {
    set({
      board: nextBoard,
      occupiedCount,
      currentPlayer: player,
      status: "playing",
      winner: null,
      winningLine: [],
      winningCell: null,
      cursor: resolved,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      bonusPlacesRemaining: state.bonusPlacesRemaining - 1,
      powerUpMode: null,
      pendingSwarmEarner: player,
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
    cursor: resolved,
    fallingKey: dropAnim ? key : null,
    dropBusy: dropAnim,
    powerUpMode: null,
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
  pendingSwarmEarner: null,
  swarm: null,
  swarmBusy: false,
  swarmPopped: {},
  powerUpMode: null,
  clearAxis: "x",
  powerUpToast: null,
  watchPowerUp: null,
  watchTipPlayback: false,
  pendingTipSync: null,
  swarmAiResult: null,
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
  cursor: { x: 1, y: 1, z: 1 },
  aiming: false,
  fallingKey: null,
  dropBusy: false,
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
    if (state.dropBusy || state.swarmBusy) return false;
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
    if (!canSpend(state.inventory[by], kind)) return false;

    if (kind === "extra-turn") {
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
      // Refund if no place has consumed the bonus yet
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
    });
  },

  confirmClearRow: (a, b) => {
    const state = get();
    if (state.powerUpMode !== "clear-row" || state.status !== "playing") return false;
    if (state.dropBusy || state.swarmBusy) return false;
    const by = state.currentPlayer;
    if (state.playMode === "ai" && by !== HUMAN) return false;
    if (state.playMode === "online") {
      if (state.seat == null || by !== state.seat) return false;
    }
    const spent = spendPowerUp(state.inventory[by], "clear-row");
    if (!spent) return false;
    const dims = getPreset(state.presetId).dims;
    let board = clearAxisLine(state.board, dims, state.clearAxis, a, b);
    if (state.placement === "drop") board = repackDrop(board, dims);
    const label = state.displayName(by);
    if (state.playMode === "online") {
      publishPowerUpNotify("clear-row", by, "confirm");
      publishClearAimEnd(by);
    }
    finishPowerUpBoard(get, set, board, by, spent, `${label} cleared a row`);
    return true;
  },

  confirmTip: () => {
    const state = get();
    if (state.powerUpMode !== "tip" || state.status !== "playing") return false;
    if (state.dropBusy || state.swarmBusy || state.tipFalling) return false;
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

    // Spectator replay of opponent's commit — apply board (or pending sync) and exit.
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
          onlineStatus: pending.onlineStatus,
          tipFalling: false,
          tipEuler: { ...IDENTITY_TIP_EULER },
          tipTargetEuler: { ...IDENTITY_TIP_EULER },
          watchTipPlayback: false,
          pendingTipSync: null,
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
          watchTipPlayback: false,
        });
        return;
      }
      const board = tipBoardFromEuler(state.board, dims, state.tipEuler);
      set({
        board,
        occupiedCount: board.size,
        tipFalling: false,
        tipEuler: { ...IDENTITY_TIP_EULER },
        tipTargetEuler: { ...IDENTITY_TIP_EULER },
        watchTipPlayback: false,
        watchPowerUp: null,
        powerUpMode: null,
      });
      return;
    }

    if (state.powerUpMode !== "tip") return;
    if (toDown === "-y") {
      set({ tipFalling: false });
      return;
    }
    // One tip per spend: rebase via full Euler (includes yaw), spend, exit.
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
    set({
      tipFalling: false,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipCheckpoint: null,
      tipDirty: false,
    });
    finishPowerUpBoard(get, set, board, by, spent, `${state.displayName(by)} tipped the field`);
  },

  catchSwarmPackage: (index, by) => {
    const state = get();
    if (!state.swarm || !state.swarmBusy) return;
    const plan = state.swarm;
    if (state.swarmPopped[index]) return;
    if (state.playMode === "online" && state.seat !== by) return;
    if (state.playMode === "ai" && by !== HUMAN) return;

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
    const kind = pickRandomKind(state.inventory[by], createPowerUpRng(plan.seed ^ 0xdeadbeef));
    if (!kind || !hasInventoryRoom(state.inventory[by])) {
      const swarmPopped = { ...state.swarmPopped, [index]: "deny" as const };
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped,
        swarmAiResult: null,
        powerUpToast: null,
      });
      if (state.playMode === "online") {
        localSwarmResultPublisher?.(by, index, "deny");
      }
      afterSwarm(get, set);
      return;
    }

    const next = awardPowerUp(state.inventory[by], kind);
    if (!next) {
      const swarmPopped = { ...state.swarmPopped, [index]: "deny" as const };
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped,
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
    const swarmPopped = { ...state.swarmPopped, [index]: "claim" as const };
    set({
      inventory: inv,
      swarm: null,
      swarmBusy: false,
      swarmPopped,
      swarmAiResult: null,
      powerUpToast: null,
    });
    if (state.playMode === "online") {
      localSwarmResultPublisher?.(by, index, "claim", kind);
    }
    afterSwarm(get, set);
  },

  endSwarm: () => {
    const state = get();
    if (!state.swarmBusy && !state.swarm) return;
    const plan = state.swarm;
    const aiResult = state.swarmAiResult;
    const livePopped = plan ? state.swarmPopped[plan.liveIndex] : undefined;

    // Live already claimed/denied — just clear.
    if (livePopped === "claim" || livePopped === "deny") {
      set({ swarm: null, swarmBusy: false, swarmAiResult: null, swarmPopped: {} });
      afterSwarm(get, set);
      return;
    }

    // vs AI: if human never hit the live pack, AI may luck-claim on timeout.
    if (state.playMode === "ai" && aiResult) {
      if (aiResult.caught && aiResult.kind) {
        const next = awardPowerUp(state.inventory.b, aiResult.kind);
        if (next) {
          const inv = cloneInventory(state.inventory);
          inv.b = next;
          set({
            inventory: inv,
            swarm: null,
            swarmBusy: false,
            swarmPopped: {},
            swarmAiResult: null,
            powerUpToast: null,
          });
          afterSwarm(get, set);
          return;
        }
      }
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped: {},
        swarmAiResult: null,
        powerUpToast: null,
      });
      afterSwarm(get, set);
      return;
    }

    set({
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      swarmAiResult: null,
      powerUpToast: null,
    });
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
      set({
        swarm: null,
        swarmBusy: false,
        swarmPopped: { ...state.swarmPopped, [index]: "deny" },
        swarmAiResult: null,
        powerUpToast: null,
      });
      afterSwarm(get, set);
      return;
    }

    // claim
    if (kind) {
      const next = awardPowerUp(state.inventory[by], kind);
      if (next) {
        const inv = cloneInventory(state.inventory);
        inv[by] = next;
        set({
          inventory: inv,
          swarm: null,
          swarmBusy: false,
          swarmPopped: { ...state.swarmPopped, [index]: "claim" },
          swarmAiResult: null,
          powerUpToast: null,
        });
        afterSwarm(get, set);
        return;
      }
    }
    set({
      swarm: null,
      swarmBusy: false,
      swarmPopped: { ...state.swarmPopped, [index]: "deny" },
      swarmAiResult: null,
      powerUpToast: null,
    });
    afterSwarm(get, set);
  },

  startGame: () => {
    clearAiTimer();
    const state = get();
    const dims = getPreset(state.presetId).dims;
    const placement = state.placement;
    const hotseat = state.playMode === "hotseat";
    const powerUpsEnabled = hotseat ? false : state.powerUpsEnabled;
    const startCursor =
      placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
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
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      powerUpsEnabled,
      inventory: powerUpsEnabled ? fullInventory() : emptyInventory(),
      bonusPlacesRemaining: 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      watchPowerUp: null,
      swarmAiResult: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
    });
  },

  rematch: () => {
    clearAiTimer();
    const state = get();
    const dims = getPreset(state.presetId).dims;
    const nextStarter = opponentOf(state.startingPlayer);
    const hotseat = state.playMode === "hotseat";
    const powerUpsEnabled = hotseat ? false : state.powerUpsEnabled;
    const startCursor =
      state.placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
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
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      powerUpsEnabled,
      inventory: powerUpsEnabled ? fullInventory() : emptyInventory(),
      bonusPlacesRemaining: 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      watchPowerUp: null,
      swarmAiResult: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
    });
    if (state.playMode === "ai" && nextStarter === AI_PLAYER) {
      scheduleAiMove(get, set);
    }
  },

  returnToSetup: () => {
    clearAiTimer();
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
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      watchPowerUp: null,
      swarmAiResult: null,
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
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      inventory: fullInventory(),
      bonusPlacesRemaining: 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      watchPowerUp: null,
      swarmAiResult: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      onlineStatus: "playing",
      opponentConnected: true,
      rematchVotes: { ...EMPTY_VOTES },
      onlineError: null,
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
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      inventory: fullInventory(),
      bonusPlacesRemaining: 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      watchPowerUp: null,
      swarmAiResult: null,
      tipEuler: { ...IDENTITY_TIP_EULER },
      tipTargetEuler: { ...IDENTITY_TIP_EULER },
      tipFalling: false,
      onlineStatus: "playing",
      rematchVotes: { ...EMPTY_VOTES },
    });
  },

  leaveOnline: () => {
    clearAiTimer();
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
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      inventory: emptyInventory(),
      bonusPlacesRemaining: 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      powerUpMode: null,
      powerUpToast: null,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
      swarmAiResult: null,
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

    // During spectator tip playback, hold the authoritative board until fall settles.
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
          onlineStatus,
        },
        pendingSwarmEarner: null,
        swarm: null,
        swarmBusy: false,
        swarmPopped: {},
        swarmAiResult: null,
        powerUpMode: null,
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
      inventory,
      powerUpsEnabled: snap.powerUpsEnabled ?? get().powerUpsEnabled,
      bonusPlacesRemaining: snap.bonusPlacesRemaining ?? 0,
      pendingSwarmEarner: null,
      swarm: null,
      swarmBusy: false,
      swarmPopped: {},
      swarmAiResult: null,
      powerUpMode: null,
      watchPowerUp: null,
      watchTipPlayback: false,
      pendingTipSync: null,
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
      onlineStatus,
      opponentConnected: true,
    });
  },

  placeAtCursor: () => {
    const state = get();
    return state.place(state.cursor);
  },

  place: (coord) => {
    const state = get();
    if (state.status !== "playing") return false;
    if (state.dropBusy || state.swarmBusy || state.tipFalling) return false;
    if (state.watchTipPlayback) return false;
    if (state.powerUpMode === "clear-row" || state.powerUpMode === "tip") return false;
    if (state.playMode === "ai" && state.currentPlayer !== HUMAN) return false;
    if (state.playMode === "online") {
      if (state.onlineStatus !== "playing") return false;
      if (state.seat == null || state.currentPlayer !== state.seat) return false;
    }
    const by = state.currentPlayer;
    const ok = applyPlace(get, set, coord, by);
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
    const earner = state.pendingSwarmEarner;
    set({ dropBusy: false, fallingKey: null, pendingSwarmEarner: null });
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

/** Restore last Mode / Placement / Preset / Difficulty from localStorage. */
export function hydrateSetupFromStorage() {
  if (typeof window === "undefined") return;
  const prefs = readSetupPrefsFromStorage();
  if (Object.keys(prefs).length === 0) return;
  const presetId = prefs.presetId ?? useGameStore.getState().presetId;
  if (prefs.aiDifficulty === "extreme" && presetId === "3x3x3") {
    prefs.aiDifficulty = "hard";
  }
  useGameStore.setState(prefs);
}
