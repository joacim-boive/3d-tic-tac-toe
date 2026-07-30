import type { BoardDims, GamePreset, PresetId } from "./types";
import { MAX_BOARD_SIZE, winLength } from "./types";

export const PRESETS: readonly GamePreset[] = [
  {
    id: "3x3x3",
    label: "3×3×3",
    description: "Classic cube · 3 in a row",
    dims: { x: 3, y: 3, z: 3 },
  },
  {
    id: "4x4x3",
    label: "4×4×3",
    description: "Wider field · 3 in a row",
    dims: { x: 4, y: 4, z: 3 },
  },
  {
    id: "5x5x3",
    label: "5×5×3",
    description: "Wide field · 3 in a row",
    dims: { x: 5, y: 5, z: 3 },
  },
] as const;

function assertDims(dims: BoardDims) {
  if (dims.x > MAX_BOARD_SIZE || dims.y > MAX_BOARD_SIZE || dims.z > MAX_BOARD_SIZE) {
    throw new Error(`Preset size exceeds MAX_BOARD_SIZE (${MAX_BOARD_SIZE})`);
  }
  if (winLength(dims) < 1) {
    throw new Error("Win length (Z) must be at least 1");
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
