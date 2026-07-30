import { create } from "zustand";
import { pickAiMove } from "./ai";
import { cellKey, checkWin, createEmptyBoard, isDraw, type Board } from "./board";
import { getPreset } from "./presets";
import type { AiDifficulty, CellCoord, GameStatus, PlayMode, PlayerId, PresetId } from "./types";
import { centerCell } from "./types";

const AI_DELAY_MS = 400;
const HUMAN: PlayerId = "a";
const AI_PLAYER: PlayerId = "b";

type GameState = {
  phase: "setup" | "playing";
  presetId: PresetId;
  playMode: PlayMode;
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
  setPresetId: (id: PresetId) => void;
  setPlayMode: (mode: PlayMode) => void;
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setAiming: (aiming: boolean) => void;
  setCursor: (coord: CellCoord) => void;
  nudgeCursor: (dx: number, dy: number, dz: number) => void;
  startGame: () => void;
  returnToSetup: () => void;
  placeAtCursor: () => boolean;
  place: (coord: CellCoord) => boolean;
};

let aiTimer: ReturnType<typeof setTimeout> | null = null;

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

function scheduleAiMove(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  clearAiTimer();
  aiTimer = setTimeout(() => {
    aiTimer = null;
    const state = get();
    if (state.status !== "playing" || state.playMode !== "ai") return;
    if (state.currentPlayer !== AI_PLAYER) return;

    const preset = getPreset(state.presetId);
    const move = pickAiMove(
      state.board,
      preset.dims,
      state.aiDifficulty,
      AI_PLAYER,
      state.occupiedCount,
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

  const key = cellKey(coord.x, coord.y, coord.z);
  if (state.board.has(key)) return false;

  const preset = getPreset(state.presetId);
  const nextBoard = new Map(state.board);
  nextBoard.set(key, player);
  const occupiedCount = state.occupiedCount + 1;

  const win = checkWin(nextBoard, preset.dims, coord, player);
  if (win) {
    set({
      board: nextBoard,
      occupiedCount,
      status: "won",
      winner: win.winner,
      winningLine: win.line,
      cursor: coord,
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
      cursor: coord,
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
    cursor: coord,
  });

  if (state.playMode === "ai" && nextPlayer === AI_PLAYER) {
    scheduleAiMove(get, set);
  }

  return true;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: "setup",
  presetId: "3x3x3",
  playMode: "hotseat",
  aiDifficulty: "medium",
  board: createEmptyBoard(),
  occupiedCount: 0,
  currentPlayer: "a",
  status: "playing",
  winner: null,
  winningLine: [],
  cursor: { x: 1, y: 1, z: 1 },
  aiming: false,

  setPresetId: (id) => set({ presetId: id }),
  setPlayMode: (mode) => set({ playMode: mode }),
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setAiming: (aiming) => set({ aiming }),
  setCursor: (coord) => {
    const dims = getPreset(get().presetId).dims;
    set({ cursor: clampCursor(coord, dims) });
  },

  nudgeCursor: (dx, dy, dz) => {
    const state = get();
    if (state.status !== "playing") return;
    const dims = getPreset(state.presetId).dims;
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

  startGame: () => {
    clearAiTimer();
    const dims = getPreset(get().presetId).dims;
    set({
      phase: "playing",
      board: createEmptyBoard(),
      occupiedCount: 0,
      currentPlayer: "a",
      status: "playing",
      winner: null,
      winningLine: [],
      cursor: centerCell(dims),
      aiming: false,
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
    });
  },

  placeAtCursor: () => {
    const state = get();
    return state.place(state.cursor);
  },

  place: (coord) => {
    const state = get();
    if (state.status !== "playing") return false;
    if (state.playMode === "ai" && state.currentPlayer !== HUMAN) return false;
    return applyPlace(get, set, coord, state.currentPlayer);
  },
}));
