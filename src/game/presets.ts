import type { BoardDims, GamePreset, PresetId } from "./types";
import { MAX_BOARD_SIZE, winLength } from "./types";

/**
 * Win length defaults to Z; flat boards set `w` explicitly (7×6 needs 4-in-a-row).
 * Larger footprints with only 3-in-a-row (old 4×4×3 / 5×5×3) let the starter
 * force wins too easily — especially in Drop — so mid/large presets require
 * 4-in-a-row on deeper boards.
 */
export const PRESETS: readonly GamePreset[] = [
  {
    id: "7x6",
    label: "7×6",
    description: "Classic flat · 4 in a row",
    dims: { x: 7, y: 6, z: 1, w: 4 },
  },
  {
    id: "3x3x3",
    label: "3×3×3",
    description: "Blitz cube · 3 in a row",
    dims: { x: 3, y: 3, z: 3 },
  },
  {
    id: "4x4x4",
    label: "4×4×4",
    description: "Classic cube · 4 in a row",
    dims: { x: 4, y: 4, z: 4 },
  },
  {
    id: "5x5x4",
    label: "5×5×4",
    description: "Wide field · 4 in a row",
    dims: { x: 5, y: 5, z: 4 },
  },
] as const;

function assertDims(dims: BoardDims) {
  if (dims.x > MAX_BOARD_SIZE || dims.y > MAX_BOARD_SIZE || dims.z > MAX_BOARD_SIZE) {
    throw new Error(`Preset size exceeds MAX_BOARD_SIZE (${MAX_BOARD_SIZE})`);
  }
  if (winLength(dims) < 1) {
    throw new Error("Win length must be at least 1");
  }
}

export function getPreset(id: PresetId): GamePreset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) {
    throw new Error(`Unknown preset: ${id}`);
  }
  assertDims(preset.dims);
  return preset;
}

/** Map legacy / unknown ids (e.g. old online rooms) onto current presets. */
export function resolvePresetId(id: string): PresetId {
  if (id === "4x4x3") return "4x4x4";
  if (id === "5x5x3") return "5x5x4";
  if (id === "3x3") return "7x6";
  if (id === "7x6" || id === "3x3x3" || id === "4x4x4" || id === "5x5x4") return id;
  return "3x3x3";
}
