import {
  cellKey,
  checkWin,
  createEmptyBoard,
  isDraw,
  listDropLandings,
  listEmptyCells,
  type Board,
} from "./board";
import { pickAiMove, type AiSearchOptions } from "./ai";
import { getPreset } from "./presets";
import type {
  AiDifficulty,
  BoardDims,
  CellCoord,
  PlacementMode,
  PlayerId,
  PresetId,
} from "./types";
import { cellCount } from "./types";

export type Rng = () => number;

/** Mulberry32 — tiny seeded PRNG for reproducible self-play batches. */
export function createRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type SelfPlayConfig = {
  dims: BoardDims;
  placement: PlacementMode;
  games: number;
  /** First player (Coral / `a`) policy. Also used for second when `vsDifficulty` is omitted. */
  difficulty: AiDifficulty;
  /** Second player (Cyan / `b`) policy. Defaults to `difficulty` (symmetric self-play). */
  vsDifficulty?: AiDifficulty;
  /**
   * When true, odd games swap seat policies so each difficulty opens half the time.
   * Useful for head-to-head strength measurement.
   */
  swapSeats?: boolean;
  /** How many opening plies to fingerprint (default 2). */
  openingPlies?: number;
  /** Seed for AI tie-breaks / random policies. */
  seed?: number;
  /** Hard-search wall-clock budget; Infinity = finish each depth (offline eval). */
  budgetMs?: number;
  /** Override budget for the `--vs` / second seat only. */
  vsBudgetMs?: number;
  maxDepth?: number;
  /** Optional progress every N games. */
  onProgress?: (played: number, total: number) => void;
};

export type SelfPlayStats = {
  games: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  totalPlies: number;
  /** opening key → count */
  openings: Map<string, number>;
  elapsedMs: number;
  /**
   * When measuring two different difficulties with seat swaps, wins attributed
   * to the primary (`difficulty`) policy regardless of who opened.
   */
  primaryWins: number;
  opponentWins: number;
  /** Primary wins in games where primary opened (matchups only; else 0). */
  primaryWinsAsFirst: number;
  /** Games where primary opened. */
  primaryOpenedGames: number;
  /** Primary wins in games where primary sat second. */
  primaryWinsAsSecond: number;
  /** Games where primary sat second. */
  primarySecondGames: number;
};

export type SelfPlayGameResult = {
  winner: PlayerId | null;
  plies: number;
  opening: string;
};

function legalMoves(board: Board, dims: BoardDims, placement: PlacementMode): CellCoord[] {
  return placement === "drop" ? listDropLandings(board, dims) : listEmptyCells(board, dims);
}

function formatCell(c: CellCoord): string {
  return `${c.x},${c.y},${c.z}`;
}

/**
 * Play one game to completion. Player `a` always opens unless `swapSeats` maps policies.
 * Mutates nothing outside the returned result.
 */
export function playOneGame(
  dims: BoardDims,
  placement: PlacementMode,
  difficultyA: AiDifficulty,
  difficultyB: AiDifficulty,
  searchA: AiSearchOptions,
  searchB: AiSearchOptions,
  openingPlies: number,
): SelfPlayGameResult {
  const board = createEmptyBoard();
  let occupied = 0;
  let toMove: PlayerId = "a";
  const openingMoves: string[] = [];
  const maxPlies = cellCount(dims);

  for (let plies = 0; plies < maxPlies; plies++) {
    const difficulty = toMove === "a" ? difficultyA : difficultyB;
    const search = toMove === "a" ? searchA : searchB;
    const move = pickAiMove(board, dims, difficulty, toMove, occupied, placement, search);
    if (!move) {
      return {
        winner: null,
        plies,
        opening: openingMoves.join("|") || "(empty)",
      };
    }

    if (openingMoves.length < openingPlies) {
      openingMoves.push(formatCell(move));
    }

    const key = cellKey(move.x, move.y, move.z);
    board.set(key, toMove);
    occupied += 1;

    const win = checkWin(board, dims, move, toMove);
    if (win) {
      return {
        winner: toMove,
        plies: occupied,
        opening: openingMoves.join("|"),
      };
    }
    if (isDraw(occupied, dims) || legalMoves(board, dims, placement).length === 0) {
      return {
        winner: null,
        plies: occupied,
        opening: openingMoves.join("|"),
      };
    }

    toMove = toMove === "a" ? "b" : "a";
  }

  return {
    winner: null,
    plies: occupied,
    opening: openingMoves.join("|") || "(empty)",
  };
}

export function runSelfPlay(config: SelfPlayConfig): SelfPlayStats {
  const openingPlies = config.openingPlies ?? 2;
  const rng = createRng(config.seed ?? 0xc0ffee);
  const searchA: AiSearchOptions = {
    rng,
    budgetMs: config.budgetMs,
    maxDepth: config.maxDepth,
  };
  const searchB: AiSearchOptions = {
    rng,
    budgetMs: config.vsBudgetMs ?? config.budgetMs,
    maxDepth: config.maxDepth,
  };
  const vs = config.vsDifficulty ?? config.difficulty;
  const swap = config.swapSeats === true && vs !== config.difficulty;

  const openings = new Map<string, number>();
  let firstWins = 0;
  let secondWins = 0;
  let draws = 0;
  let totalPlies = 0;
  let primaryWins = 0;
  let opponentWins = 0;
  let primaryWinsAsFirst = 0;
  let primaryOpenedGames = 0;
  let primaryWinsAsSecond = 0;
  let primarySecondGames = 0;

  const t0 = performance.now();
  for (let i = 0; i < config.games; i++) {
    const swapped = swap && i % 2 === 1;
    const difficultyA = swapped ? vs : config.difficulty;
    const difficultyB = swapped ? config.difficulty : vs;
    // Keep each policy on its own budget when seats swap.
    const seatSearchA = swapped ? searchB : searchA;
    const seatSearchB = swapped ? searchA : searchB;
    const result = playOneGame(
      config.dims,
      config.placement,
      difficultyA,
      difficultyB,
      seatSearchA,
      seatSearchB,
      openingPlies,
    );
    totalPlies += result.plies;
    if (result.winner === "a") firstWins += 1;
    else if (result.winner === "b") secondWins += 1;
    else draws += 1;

    const primaryIsFirst = difficultyA === config.difficulty;
    if (primaryIsFirst) primaryOpenedGames += 1;
    else primarySecondGames += 1;

    if (result.winner === "a") {
      if (difficultyA === config.difficulty) {
        primaryWins += 1;
        primaryWinsAsFirst += 1;
      } else opponentWins += 1;
    } else if (result.winner === "b") {
      if (difficultyB === config.difficulty) {
        primaryWins += 1;
        primaryWinsAsSecond += 1;
      } else opponentWins += 1;
    }

    openings.set(result.opening, (openings.get(result.opening) ?? 0) + 1);
    config.onProgress?.(i + 1, config.games);
  }
  const elapsedMs = performance.now() - t0;

  return {
    games: config.games,
    firstWins,
    secondWins,
    draws,
    totalPlies,
    openings,
    elapsedMs,
    primaryWins,
    opponentWins,
    primaryWinsAsFirst,
    primaryOpenedGames,
    primaryWinsAsSecond,
    primarySecondGames,
  };
}

export type SelfPlayReportMeta = {
  label: string;
  placement: PlacementMode;
  difficulty: AiDifficulty;
  vsDifficulty?: AiDifficulty;
  swapSeats?: boolean;
  seed?: number;
};

export function topOpenings(
  openings: Map<string, number>,
  limit = 10,
): Array<{ opening: string; count: number; rate: number }> {
  const total = [...openings.values()].reduce((a, b) => a + b, 0) || 1;
  return [...openings.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([opening, count]) => ({
      opening,
      count,
      rate: count / total,
    }));
}

export function formatSelfPlayReport(stats: SelfPlayStats, meta: SelfPlayReportMeta): string {
  const n = stats.games || 1;
  const pct = (c: number) => `${((100 * c) / n).toFixed(1)}%`;
  const avgLen = (stats.totalPlies / n).toFixed(2);
  const gamesPerSec = stats.elapsedMs > 0 ? ((1000 * n) / stats.elapsedMs).toFixed(1) : "∞";
  const tops = topOpenings(stats.openings, 8);
  const vs = meta.vsDifficulty ?? meta.difficulty;
  const matchup =
    vs === meta.difficulty
      ? meta.difficulty
      : `${meta.difficulty} vs ${vs}${meta.swapSeats ? " (swapped seats)" : ""}`;

  const lines = [
    `Self-play · ${meta.label} · ${meta.placement} · ${matchup}`,
    `Games: ${stats.games}  ·  ${gamesPerSec} games/s  ·  ${stats.elapsedMs.toFixed(0)} ms`,
    `First (Coral) wins:  ${stats.firstWins}  (${pct(stats.firstWins)})`,
    `Second (Cyan) wins:  ${stats.secondWins}  (${pct(stats.secondWins)})`,
    `Draws:               ${stats.draws}  (${pct(stats.draws)})`,
  ];

  if (vs !== meta.difficulty) {
    lines.push(
      `Primary (${meta.difficulty}) wins: ${stats.primaryWins}  (${pct(stats.primaryWins)})`,
      `Opponent (${vs}) wins:     ${stats.opponentWins}  (${pct(stats.opponentWins)})`,
    );
    if (stats.primaryOpenedGames > 0) {
      const asFirstRate = (100 * stats.primaryWinsAsFirst) / stats.primaryOpenedGames;
      lines.push(
        `Primary as first:  ${stats.primaryWinsAsFirst}/${stats.primaryOpenedGames}  (${asFirstRate.toFixed(1)}%)`,
      );
    }
    if (stats.primarySecondGames > 0) {
      const asSecondRate = (100 * stats.primaryWinsAsSecond) / stats.primarySecondGames;
      lines.push(
        `Primary as second: ${stats.primaryWinsAsSecond}/${stats.primarySecondGames}  (${asSecondRate.toFixed(1)}%)`,
      );
    }
    if (stats.primaryOpenedGames > 0 && stats.primarySecondGames > 0) {
      const asFirstRate = (100 * stats.primaryWinsAsFirst) / stats.primaryOpenedGames;
      const asSecondRate = (100 * stats.primaryWinsAsSecond) / stats.primarySecondGames;
      const strength = (asFirstRate + asSecondRate) / 2;
      lines.push(
        `Seat-averaged strength: ${strength.toFixed(1)}%  (50% ≈ even; opener bias cancelled)`,
      );
    }
  }

  lines.push(`Average game length: ${avgLen} plies`, "Most common openings:");

  for (const row of tops) {
    lines.push(`  ${(100 * row.rate).toFixed(1).padStart(5)}%  ×${row.count}  ${row.opening}`);
  }

  return lines.join("\n");
}

export function configFromPreset(
  presetId: PresetId,
  partial: Omit<SelfPlayConfig, "dims"> & { dims?: BoardDims },
): SelfPlayConfig {
  const preset = getPreset(presetId);
  return {
    ...partial,
    dims: partial.dims ?? preset.dims,
  };
}
