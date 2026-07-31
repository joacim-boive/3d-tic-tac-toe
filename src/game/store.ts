import { create } from "zustand";
import { pickAiMove } from "./ai";
import {
  cellKey,
  checkWin,
  createEmptyBoard,
  dropLanding,
  isDraw,
  resolvePlaceCoord,
  type Board,
} from "./board";
import { getPreset } from "./presets";
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

type GamePhase = "setup" | "lobby" | "playing";

type GameState = {
  phase: GamePhase;
  presetId: PresetId;
  playMode: PlayMode;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  board: Board;
  occupiedCount: number;
  currentPlayer: PlayerId;
  status: GameStatus;
  winner: PlayerId | null;
  winningLine: CellCoord[];
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
  setLocalName: (name: string) => void;
  setAiming: (aiming: boolean) => void;
  setCursor: (coord: CellCoord) => void;
  nudgeCursor: (dx: number, dy: number, dz: number) => void;
  startGame: () => void;
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
  }) => void;
};

let aiTimer: ReturnType<typeof setTimeout> | null = null;

/** ponytail: session registers publisher; upgrade = explicit online middleware. */
let localPlacePublisher: ((coord: CellCoord, by: PlayerId) => void) | null = null;

export function setLocalPlacePublisher(
  fn: ((coord: CellCoord, by: PlayerId) => void) | null,
): void {
  localPlacePublisher = fn;
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
function snapDropCursor(coord: CellCoord, board: Board, dims: { x: number; y: number; z: number }): CellCoord {
  const clamped = clampCursor(coord, dims);
  const land = dropLanding(board, dims, clamped.x, clamped.z);
  if (land) return land;
  return { x: clamped.x, y: dims.y - 1, z: clamped.z };
}

function scheduleAiMove(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  clearAiTimer();
  aiTimer = setTimeout(() => {
    aiTimer = null;
    const state = get();
    if (state.status !== "playing" || state.playMode !== "ai") return;
    if (state.currentPlayer !== AI_PLAYER) return;
    if (state.dropBusy) return;

    const preset = getPreset(state.presetId);
    const move = pickAiMove(
      state.board,
      preset.dims,
      state.aiDifficulty,
      AI_PLAYER,
      state.occupiedCount,
      state.placement,
    );
    if (!move) return;

    applyPlace(get, set, move, AI_PLAYER);
  }, AI_DELAY_MS);
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
  if (state.dropBusy) return false;

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
      cursor: resolved,
      aiming: false,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
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
      cursor: resolved,
      aiming: false,
      fallingKey: dropAnim ? key : null,
      dropBusy: dropAnim,
      onlineStatus: state.playMode === "online" ? "ended" : state.onlineStatus,
      rematchVotes: state.playMode === "online" ? { ...EMPTY_VOTES } : state.rematchVotes,
    });
    return true;
  }

  const nextPlayer: PlayerId = player === "a" ? "b" : "a";
  set({
    board: nextBoard,
    occupiedCount,
    currentPlayer: nextPlayer,
    status: "playing",
    winner: null,
    winningLine: [],
    cursor: resolved,
    fallingKey: dropAnim ? key : null,
    dropBusy: dropAnim,
  });

  if (!dropAnim && state.playMode === "ai" && nextPlayer === AI_PLAYER) {
    scheduleAiMove(get, set);
  }

  return true;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: "setup",
  presetId: "3x3x3",
  playMode: "hotseat",
  placement: "free",
  aiDifficulty: "medium",
  board: createEmptyBoard(),
  occupiedCount: 0,
  currentPlayer: "a",
  status: "playing",
  winner: null,
  winningLine: [],
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

  setPresetId: (id) => set({ presetId: id }),
  setPlayMode: (mode) => set({ playMode: mode }),
  setPlacement: (placement) => set({ placement }),
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setLocalName: (name) => {
    const localName = name.slice(0, 16);
    persistLocalName(localName);
    set({ localName });
  },
  setAiming: (aiming) => set({ aiming }),
  setCursor: (coord) => {
    const state = get();
    const dims = getPreset(state.presetId).dims;
    if (state.placement === "drop") {
      set({ cursor: snapDropCursor(coord, state.board, dims) });
      return;
    }
    set({ cursor: clampCursor(coord, dims) });
  },

  nudgeCursor: (dx, dy, dz) => {
    const state = get();
    if (state.status !== "playing") return;
    if (state.playMode === "online" && state.onlineStatus !== "playing") return;
    const dims = getPreset(state.presetId).dims;
    if (state.placement === "drop") {
      // Drop mode: horizontal plane only (Y comes from gravity).
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
  },

  displayName: (player) => {
    const name = get().playerNames[player].trim();
    return name || PLAYER_LABELS[player];
  },

  startGame: () => {
    clearAiTimer();
    const dims = getPreset(get().presetId).dims;
    const placement = get().placement;
    const startCursor =
      placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    set({
      phase: "playing",
      board: createEmptyBoard(),
      occupiedCount: 0,
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
    });
  },

  returnToSetup: () => {
    clearAiTimer();
    set({
      phase: "setup",
      board: createEmptyBoard(),
      occupiedCount: 0,
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      aiming: false,
      fallingKey: null,
      dropBusy: false,
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
    const dims = getPreset(presetId).dims;
    const mode = placement ?? get().placement;
    const startCursor =
      mode === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    set({
      phase: "playing",
      playMode: "online",
      presetId,
      placement: mode,
      playerNames: names,
      board: createEmptyBoard(),
      occupiedCount: 0,
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
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
    const startCursor =
      state.placement === "drop"
        ? snapDropCursor(centerCell(dims), createEmptyBoard(), dims)
        : centerCell(dims);
    set({
      board: createEmptyBoard(),
      occupiedCount: 0,
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      cursor: startCursor,
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      onlineStatus: "playing",
      rematchVotes: { ...EMPTY_VOTES },
    });
  },

  leaveOnline: () => {
    clearAiTimer();
    localPlacePublisher = null;
    set({
      phase: "setup",
      board: createEmptyBoard(),
      occupiedCount: 0,
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      aiming: false,
      fallingKey: null,
      dropBusy: false,
      roomId: null,
      seat: null,
      onlineStatus: "idle",
      playerNames: { ...EMPTY_NAMES },
      rematchVotes: { ...EMPTY_VOTES },
      opponentConnected: false,
    });
  },

  hydrateFromSnapshot: (snap) => {
    const dims = getPreset(snap.presetId).dims;
    const placement = snap.placement ?? get().placement;
    const onlineStatus: OnlineStatus =
      snap.status === "won" || snap.status === "draw" ? "ended" : "playing";
    set({
      phase: "playing",
      playMode: "online",
      board: snap.board,
      occupiedCount: snap.occupiedCount,
      currentPlayer: snap.currentPlayer,
      playerNames: snap.names,
      presetId: snap.presetId,
      placement,
      status: snap.status,
      winner: snap.winner,
      winningLine: snap.winningLine,
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
    if (state.dropBusy) return false;
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
    set({ dropBusy: false, fallingKey: null });
    const next = get();
    if (next.status === "playing" && next.playMode === "ai" && next.currentPlayer === AI_PLAYER) {
      scheduleAiMove(get, set);
    }
  },
}));

/** Call once on mount of screens that show the name field (avoids SSR mismatch). */
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
