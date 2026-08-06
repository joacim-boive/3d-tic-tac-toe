import { resolvePresetId } from "./presets";
import type { AiDifficulty, PlacementMode, PlayMode, PresetId } from "./types";

export const LOCAL_SETUP_PREFS_KEY = "voxel-toe-setup";

/** Query keys mirrored in the shareable setup URL. */
export const SETUP_URL_KEYS = {
  playMode: "mode",
  placement: "placement",
  presetId: "preset",
  aiDifficulty: "difficulty",
  powerUpsEnabled: "powerUps",
} as const;

export type SetupPrefs = {
  presetId: PresetId;
  playMode: PlayMode;
  placement: PlacementMode;
  aiDifficulty: AiDifficulty;
  powerUpsEnabled: boolean;
};

const PLAY_MODES: readonly PlayMode[] = ["hotseat", "ai", "online"];
const PLACEMENTS: readonly PlacementMode[] = ["free", "drop"];
const DIFFICULTIES: readonly AiDifficulty[] = ["easy", "medium", "hard", "extreme", "impossible"];

function isPlayMode(v: unknown): v is PlayMode {
  return typeof v === "string" && (PLAY_MODES as readonly string[]).includes(v);
}

function isPlacement(v: unknown): v is PlacementMode {
  return typeof v === "string" && (PLACEMENTS as readonly string[]).includes(v);
}

function isDifficulty(v: unknown): v is AiDifficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}

function parsePowerUpsFlag(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return undefined;
  const normalized = v.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") {
    return false;
  }
  return undefined;
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
  if (typeof obj.powerUpsEnabled === "boolean") out.powerUpsEnabled = obj.powerUpsEnabled;

  return out;
}

/**
 * Read setup options from URL search params.
 * Accepts both canonical keys (`mode`, `preset`, …) and store-field aliases
 * (`playMode`, `presetId`, …) so pasted links stay forgiving.
 */
export function parseSetupPrefsFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): Partial<SetupPrefs> {
  const raw: Record<string, unknown> = {};

  const mode = params.get(SETUP_URL_KEYS.playMode) ?? params.get("playMode");
  if (mode !== null) raw.playMode = mode;

  const placement = params.get(SETUP_URL_KEYS.placement);
  if (placement !== null) raw.placement = placement;

  const preset = params.get(SETUP_URL_KEYS.presetId) ?? params.get("presetId");
  if (preset !== null) raw.presetId = preset;

  const difficulty = params.get(SETUP_URL_KEYS.aiDifficulty) ?? params.get("aiDifficulty");
  if (difficulty !== null) raw.aiDifficulty = difficulty;

  const powerUpsRaw =
    params.get(SETUP_URL_KEYS.powerUpsEnabled) ?? params.get("powerUpsEnabled");
  const powerUps = powerUpsRaw === null ? undefined : parsePowerUpsFlag(powerUpsRaw);

  const parsed = parseSetupPrefs(raw);
  if (powerUps !== undefined) parsed.powerUpsEnabled = powerUps;
  return parsed;
}

/** Serialize full setup prefs into shareable query keys. */
export function setupPrefsToSearchParams(prefs: SetupPrefs): URLSearchParams {
  const params = new URLSearchParams();
  params.set(SETUP_URL_KEYS.playMode, prefs.playMode);
  params.set(SETUP_URL_KEYS.placement, prefs.placement);
  params.set(SETUP_URL_KEYS.presetId, prefs.presetId);
  params.set(SETUP_URL_KEYS.aiDifficulty, prefs.aiDifficulty);
  params.set(SETUP_URL_KEYS.powerUpsEnabled, prefs.powerUpsEnabled ? "on" : "off");
  return params;
}

/** True when the URL carries at least one recognized setup key. */
export function searchParamsHaveSetupPrefs(
  params: URLSearchParams | { get(name: string): string | null; has?(name: string): boolean },
): boolean {
  const keys = [
    SETUP_URL_KEYS.playMode,
    "playMode",
    SETUP_URL_KEYS.placement,
    SETUP_URL_KEYS.presetId,
    "presetId",
    SETUP_URL_KEYS.aiDifficulty,
    "aiDifficulty",
    SETUP_URL_KEYS.powerUpsEnabled,
    "powerUpsEnabled",
  ];
  return keys.some((key) => {
    if (typeof params.has === "function") return params.has(key);
    return params.get(key) !== null;
  });
}

/**
 * Apply setup query keys onto an existing URL, preserving unrelated params
 * (e.g. cache-bust `_app`) and dropping stale setup aliases.
 */
export function applySetupPrefsToUrl(url: URL, prefs: SetupPrefs): URL {
  const next = new URL(url.href);
  for (const key of [
    SETUP_URL_KEYS.playMode,
    "playMode",
    SETUP_URL_KEYS.placement,
    SETUP_URL_KEYS.presetId,
    "presetId",
    SETUP_URL_KEYS.aiDifficulty,
    "aiDifficulty",
    SETUP_URL_KEYS.powerUpsEnabled,
    "powerUpsEnabled",
  ]) {
    next.searchParams.delete(key);
  }
  const setup = setupPrefsToSearchParams(prefs);
  for (const [key, value] of setup) {
    next.searchParams.set(key, value);
  }
  return next;
}

/** Write current setup into the address bar without adding history entries. */
export function writeSetupPrefsToUrl(prefs: SetupPrefs): void {
  if (typeof window === "undefined") return;
  try {
    const next = applySetupPrefsToUrl(new URL(window.location.href), prefs);
    const current = window.location.pathname + window.location.search + window.location.hash;
    const target = next.pathname + next.search + next.hash;
    if (current === target) return;
    window.history.replaceState(window.history.state, "", target);
  } catch {
    // ignore malformed location
  }
}

export function readSetupPrefsFromUrl(): Partial<SetupPrefs> {
  if (typeof window === "undefined") return {};
  try {
    return parseSetupPrefsFromSearchParams(new URL(window.location.href).searchParams);
  } catch {
    return {};
  }
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
