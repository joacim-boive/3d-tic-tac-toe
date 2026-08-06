import { resolvePresetId } from "./presets";
import { emptyCounts, POWER_UP_IDS, type PowerUpInventory } from "./powerUps";
import type {
  AiDifficulty,
  PlacementMode,
  PlayMode,
  PlayerId,
  PresetId,
} from "./types";

export const LOCAL_SAVED_GAME_KEY = "voxel-toe-game";

/** Local in-progress match that can be restored from setup. */
export type SavedGame = {
  presetId: PresetId;
  playMode: "hotseat" | "ai";
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  powerUpsEnabled: boolean;
  board: Array<[string, PlayerId]>;
  occupiedCount: number;
  currentPlayer: PlayerId;
  startingPlayer: PlayerId;
  inventory: PowerUpInventory;
  bonusPlacesRemaining: number;
};

export type SavedGameSetup = {
  presetId: PresetId;
  playMode: PlayMode;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  powerUpsEnabled: boolean;
};

const PLAYERS: readonly PlayerId[] = ["a", "b"];
const PLACEMENTS: readonly PlacementMode[] = ["free", "drop"];
const DIFFICULTIES: readonly AiDifficulty[] = ["easy", "medium", "hard", "extreme", "impossible"];

function isPlayerId(v: unknown): v is PlayerId {
  return v === "a" || v === "b";
}

function isPlacement(v: unknown): v is PlacementMode {
  return typeof v === "string" && (PLACEMENTS as readonly string[]).includes(v);
}

function isDifficulty(v: unknown): v is AiDifficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}

function parseInventory(raw: unknown): PowerUpInventory | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: PowerUpInventory = { a: emptyCounts(), b: emptyCounts() };
  for (const seat of PLAYERS) {
    const seatRaw = obj[seat];
    if (!seatRaw || typeof seatRaw !== "object") continue;
    const counts = seatRaw as Record<string, unknown>;
    for (const id of POWER_UP_IDS) {
      const n = counts[id];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
        out[seat][id] = Math.floor(n);
      }
    }
  }
  return out;
}

function parseBoard(raw: unknown): Array<[string, PlayerId]> | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<[string, PlayerId]> = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const key = entry[0];
    const player = entry[1];
    if (typeof key !== "string" || !key.includes(",") || !isPlayerId(player)) continue;
    out.push([key, player]);
  }
  return out;
}

/** Parse + validate a saved-game blob. Returns null if unusable. */
export function parseSavedGame(raw: unknown): SavedGame | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.playMode !== "hotseat" && obj.playMode !== "ai") return null;
  if (!isPlacement(obj.placement)) return null;
  if (!isDifficulty(obj.aiDifficulty)) return null;
  if (typeof obj.powerUpsEnabled !== "boolean") return null;
  if (typeof obj.presetId !== "string") return null;
  if (!isPlayerId(obj.currentPlayer) || !isPlayerId(obj.startingPlayer)) return null;
  if (typeof obj.occupiedCount !== "number" || !Number.isFinite(obj.occupiedCount)) return null;
  if (typeof obj.bonusPlacesRemaining !== "number" || !Number.isFinite(obj.bonusPlacesRemaining)) {
    return null;
  }

  const board = parseBoard(obj.board);
  if (!board || board.length === 0) return null;

  const inventory = parseInventory(obj.inventory);
  if (!inventory) return null;

  const occupiedCount = Math.max(board.length, Math.floor(obj.occupiedCount));
  if (occupiedCount <= 0) return null;

  return {
    presetId: resolvePresetId(obj.presetId),
    playMode: obj.playMode,
    placement: obj.placement,
    aiDifficulty: obj.aiDifficulty,
    powerUpsEnabled: obj.powerUpsEnabled,
    board,
    occupiedCount,
    currentPlayer: obj.currentPlayer,
    startingPlayer: obj.startingPlayer,
    inventory,
    bonusPlacesRemaining: Math.max(0, Math.floor(obj.bonusPlacesRemaining)),
  };
}

/**
 * Same setup = same grid (preset) + difficulty (AI), plus mode/placement/power-ups
 * so a restored board isn't dropped into a mismatched ruleset.
 */
export function savedGameMatchesSetup(saved: SavedGame, setup: SavedGameSetup): boolean {
  if (setup.playMode !== "hotseat" && setup.playMode !== "ai") return false;
  if (saved.playMode !== setup.playMode) return false;
  if (saved.presetId !== setup.presetId) return false;
  if (saved.placement !== setup.placement) return false;
  if (saved.powerUpsEnabled !== setup.powerUpsEnabled) return false;
  if (setup.playMode === "ai" && saved.aiDifficulty !== setup.aiDifficulty) return false;
  return true;
}

export function readSavedGameFromStorage(): SavedGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_SAVED_GAME_KEY);
    if (!raw) return null;
    return parseSavedGame(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeSavedGameToStorage(game: SavedGame): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SAVED_GAME_KEY, JSON.stringify(game));
  } catch {
    // private mode / quota
  }
}

export function clearSavedGameFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_SAVED_GAME_KEY);
  } catch {
    // private mode
  }
}
