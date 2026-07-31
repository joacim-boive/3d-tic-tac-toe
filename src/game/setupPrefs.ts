import { resolvePresetId } from "./presets";
import type { AiDifficulty, PlacementMode, PlayMode, PresetId } from "./types";

export const LOCAL_SETUP_PREFS_KEY = "voxel-toe-setup";

export type SetupPrefs = {
  presetId: PresetId;
  playMode: PlayMode;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
};

const PLAY_MODES: readonly PlayMode[] = ["hotseat", "ai", "online"];
const PLACEMENTS: readonly PlacementMode[] = ["free", "drop"];
const DIFFICULTIES: readonly AiDifficulty[] = ["easy", "medium", "hard", "extreme"];

function isPlayMode(v: unknown): v is PlayMode {
  return typeof v === "string" && (PLAY_MODES as readonly string[]).includes(v);
}

function isPlacement(v: unknown): v is PlacementMode {
  return typeof v === "string" && (PLACEMENTS as readonly string[]).includes(v);
}

function isDifficulty(v: unknown): v is AiDifficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}

/** Parse + validate a prefs blob (from JSON or partial updates). Unknown fields ignored. */
export function parseSetupPrefs(raw: unknown): Partial<SetupPrefs> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: Partial<SetupPrefs> = {};

  if (typeof obj.presetId === "string") {
    out.presetId = resolvePresetId(obj.presetId);
  }
  if (isPlayMode(obj.playMode)) out.playMode = obj.playMode;
  if (isPlacement(obj.placement)) out.placement = obj.placement;
  if (isDifficulty(obj.aiDifficulty)) out.aiDifficulty = obj.aiDifficulty;

  return out;
}

export function readSetupPrefsFromStorage(): Partial<SetupPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_SETUP_PREFS_KEY);
    if (!raw) return {};
    return parseSetupPrefs(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function writeSetupPrefsToStorage(prefs: SetupPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SETUP_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / quota
  }
}
