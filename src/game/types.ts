export type PlayerId = "a" | "b";

export type GameStatus = "playing" | "won" | "draw";

export type PlayMode = "hotseat" | "ai" | "online";

/** Free = place any empty cell. Drop = Connect-4 style; pieces fall along −Y. */
export type PlacementMode = "free" | "drop";

export type AiDifficulty = "easy" | "medium" | "hard";

export type OnlineStatus = "idle" | "lobby" | "playing" | "paused" | "ended";

export type PlayerNames = Record<PlayerId, string>;

export type RematchVotes = Record<PlayerId, boolean | null>;

export type CellCoord = {
  x: number;
  y: number;
  z: number;
};

/** Board extent along each axis. Win length is always `z`. */
export type BoardDims = {
  x: number;
  y: number;
  z: number;
};

export type PresetId = "3x3x3" | "4x4x3" | "5x5x3";

export type GamePreset = {
  id: PresetId;
  label: string;
  description: string;
  dims: BoardDims;
};

/** Max supported board edge; presets stay within this. */
export const MAX_BOARD_SIZE = 20;

export const PLAYER_COLORS: Record<PlayerId, string> = {
  a: "#ff6b4a",
  b: "#3ecfc8",
};

export const PLAYER_LABELS: Record<PlayerId, string> = {
  a: "Coral",
  b: "Cyan",
};

export function winLength(dims: BoardDims): number {
  return dims.z;
}

export function cellCount(dims: BoardDims): number {
  return dims.x * dims.y * dims.z;
}

export function centerCell(dims: BoardDims): CellCoord {
  return {
    x: Math.floor(dims.x / 2),
    y: Math.floor(dims.y / 2),
    z: Math.floor(dims.z / 2),
  };
}
