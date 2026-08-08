import { isExtremeAllowed } from "./ai";
import type { AiDifficulty, PresetId } from "./types";

export const LOCAL_GAME_STATS_KEY = "voxel-toe-ai-stats";

export const AI_DIFFICULTY_LABELS: Record<AiDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  extreme: "Extreme",
};

export type DifficultyStats = {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  totalTimeMs: number;
};

export type GameStats = {
  byDifficulty: Record<AiDifficulty, DifficultyStats>;
};

export type AiMatchOutcome = "win" | "loss" | "draw";

const DIFFICULTIES: readonly AiDifficulty[] = ["easy", "medium", "hard", "extreme"];

function getLocalStorage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

export function emptyDifficultyStats(): DifficultyStats {
  return { played: 0, wins: 0, losses: 0, draws: 0, totalTimeMs: 0 };
}

export function emptyGameStats(): GameStats {
  return {
    byDifficulty: {
      easy: emptyDifficultyStats(),
      medium: emptyDifficultyStats(),
      hard: emptyDifficultyStats(),
      extreme: emptyDifficultyStats(),
    },
  };
}

function isDifficulty(v: unknown): v is AiDifficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}

function parseNonNegInt(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.floor(v));
}

function parseDifficultyStats(raw: unknown): DifficultyStats {
  const base = emptyDifficultyStats();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const played = parseNonNegInt(obj.played);
  const wins = parseNonNegInt(obj.wins);
  const losses = parseNonNegInt(obj.losses);
  const draws = parseNonNegInt(obj.draws);
  const totalTimeMs = parseNonNegInt(obj.totalTimeMs);
  return {
    played: played ?? base.played,
    wins: wins ?? base.wins,
    losses: losses ?? base.losses,
    draws: draws ?? base.draws,
    totalTimeMs: totalTimeMs ?? base.totalTimeMs,
  };
}

/** Parse + validate a stats blob. Unknown fields ignored. */
export function parseGameStats(raw: unknown): GameStats {
  const out = emptyGameStats();
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  const by = obj.byDifficulty;
  if (!by || typeof by !== "object") return out;
  const map = by as Record<string, unknown>;
  for (const level of DIFFICULTIES) {
    if (level in map) out.byDifficulty[level] = parseDifficultyStats(map[level]);
  }
  return out;
}

export function readGameStatsFromStorage(): GameStats {
  const store = getLocalStorage();
  if (!store) return emptyGameStats();
  try {
    const raw = store.getItem(LOCAL_GAME_STATS_KEY);
    if (!raw) return emptyGameStats();
    return parseGameStats(JSON.parse(raw) as unknown);
  } catch {
    return emptyGameStats();
  }
}

export function writeGameStatsToStorage(stats: GameStats): void {
  const store = getLocalStorage();
  if (!store) return;
  try {
    store.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(stats));
  } catch {
    // private mode / quota
  }
}

export function getDifficultyStats(
  stats: GameStats,
  difficulty: AiDifficulty,
): DifficultyStats {
  return stats.byDifficulty[difficulty] ?? emptyDifficultyStats();
}

/**
 * Record one finished vs-AI match and persist.
 * Outcome is from the human seat (always player a).
 */
export function recordAiMatchResult(args: {
  difficulty: AiDifficulty;
  outcome: AiMatchOutcome;
  durationMs: number;
}): DifficultyStats {
  const difficulty = isDifficulty(args.difficulty) ? args.difficulty : "medium";
  const durationMs = Math.max(0, Math.floor(args.durationMs));
  const stats = readGameStatsFromStorage();
  const entry = { ...getDifficultyStats(stats, difficulty) };
  entry.played += 1;
  entry.totalTimeMs += durationMs;
  if (args.outcome === "win") entry.wins += 1;
  else if (args.outcome === "loss") entry.losses += 1;
  else entry.draws += 1;
  stats.byDifficulty[difficulty] = entry;
  writeGameStatsToStorage(stats);
  return entry;
}

/** Next rung on the difficulty ladder for this board, or null when already max. */
export function nextHarderDifficulty(
  current: AiDifficulty,
  presetId: PresetId,
): AiDifficulty | null {
  const ladder: AiDifficulty[] = isExtremeAllowed(presetId)
    ? ["easy", "medium", "hard", "extreme"]
    : ["easy", "medium", "hard"];
  const index = ladder.indexOf(current);
  if (index < 0 || index >= ladder.length - 1) return null;
  return ladder[index + 1] ?? null;
}

/** Compact duration for HUD stats (e.g. 45s, 3:12, 1h 02m). */
export function formatPlayTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
