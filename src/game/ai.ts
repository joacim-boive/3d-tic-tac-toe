import {
  cellKey,
  checkWin,
  isDraw,
  LINE_DIRECTIONS,
  listDropLandings,
  listEmptyCells,
  randomEmptyCell,
  type Board,
} from "./board";
import type { AiDifficulty, BoardDims, CellCoord, PlacementMode, PlayerId, PresetId } from "./types";
import { cellCount, winLength } from "./types";

const EASY_RANDOM_RATE = 0.7;
/** Depth for boards larger than 3×3×3 (Hard). */
const HARD_SHALLOW_DEPTH = 4;
/** Cap for 3×3×3 — full endgame search freezes Mobile Safari (main-thread watchdog). */
const HARD_DEEP_DEPTH = 5;
/** Soft wall-clock budget; iterative deepening stops when exceeded. */
const HARD_BUDGET_MS = 80;

/** Extreme: 5×5×4 and similar large boards. */
const EXTREME_LARGE_DEPTH = 5;
/** Extreme: 4×4×4 mid-size. */
const EXTREME_MID_DEPTH = 7;
/** Extreme: 3×3×3 if ever invoked (UI hides it there). */
const EXTREME_SMALL_DEPTH = 9;
/** Extreme thinks hard — still bounded for Mobile Safari. */
const EXTREME_BUDGET_MS = 450;

const WIN_SCORE = 1_000_000;
/** Leaf bonus for an open (need − 1) window — creates an immediate threat next ply. */
const THREAT_SCORE = 80_000;

export type Rng = () => number;

/** Optional overrides for offline eval / self-play (browser defaults unchanged). */
export type AiSearchOptions = {
  rng?: Rng;
  /** Search wall-clock budget in ms. Use Infinity to finish each depth. */
  budgetMs?: number;
  /** Cap iterative-deepening depth. */
  maxDepth?: number;
};

/** Extreme is offered on boards larger than classic 3×3×3. */
export function isExtremeAllowed(presetId: PresetId): boolean {
  return presetId !== "3x3x3";
}

function opponentOf(player: PlayerId): PlayerId {
  return player === "a" ? "b" : "a";
}

function pickRandom<T>(items: T[], rng: Rng): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? null;
}

function legalEmpties(board: Board, dims: BoardDims, placement: PlacementMode): CellCoord[] {
  return placement === "drop" ? listDropLandings(board, dims) : listEmptyCells(board, dims);
}

function cellIndex(cell: CellCoord, dims: BoardDims): number {
  return cell.x + dims.x * (cell.y + dims.y * cell.z);
}

/** First empty cell that wins for `player` if played now. */
export function findWinningMove(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties?: CellCoord[],
): CellCoord | null {
  const cells = empties ?? listEmptyCells(board, dims);
  for (const cell of cells) {
    board.set(cellKey(cell.x, cell.y, cell.z), player);
    const win = checkWin(board, dims, cell, player);
    board.delete(cellKey(cell.x, cell.y, cell.z));
    if (win) return cell;
  }
  return null;
}

/** How many immediate winning replies `player` has from this position. */
function countWinningReplies(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties: CellCoord[],
): number {
  let n = 0;
  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, player);
    const win = checkWin(board, dims, cell, player);
    board.delete(key);
    if (win) {
      n++;
      if (n >= 2) return n;
    }
  }
  return n;
}

/**
 * Move that leaves `player` with ≥2 immediate winning follow-ups (a fork).
 * Opponent can block only one — decisive on larger boards where shallow search misses it.
 */
function findForkMove(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
): CellCoord | null {
  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, player);
    const followUps = legalEmpties(board, dims, placement);
    const threats = countWinningReplies(board, dims, player, followUps);
    board.delete(key);
    if (threats >= 2) return cell;
  }
  return null;
}

function tacticalMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
): CellCoord | null {
  const win = findWinningMove(board, dims, aiPlayer, empties);
  if (win) return win;
  return findWinningMove(board, dims, opponentOf(aiPlayer), empties);
}

/**
 * Win → block win → own fork → block opponent fork.
 * Extreme/Hard use this before α-β so forced tactics aren't missed under a budget.
 */
function forcedTacticalMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
): CellCoord | null {
  const basic = tacticalMove(board, dims, aiPlayer, empties);
  if (basic) return basic;

  const fork = findForkMove(board, dims, aiPlayer, empties, placement);
  if (fork) return fork;

  const human = opponentOf(aiPlayer);
  return findForkMove(board, dims, human, empties, placement);
}

/** Move that leaves AI with at least one immediate winning follow-up. */
function findThreatMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
  rng: Rng,
): CellCoord | null {
  // Shuffle then take the first threat — same distribution as collecting-all + pick,
  // but stops early (matters on 5×5×4 free self-play).
  const order = [...empties];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  for (const cell of order) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, aiPlayer);
    const followUps = legalEmpties(board, dims, placement);
    const threatens = findWinningMove(board, dims, aiPlayer, followUps) !== null;
    board.delete(key);
    if (threatens) return cell;
  }
  return null;
}

function centerBias(cell: CellCoord, dims: BoardDims): number {
  const cx = (dims.x - 1) / 2;
  const cy = (dims.y - 1) / 2;
  const cz = (dims.z - 1) / 2;
  const d = (cell.x - cx) ** 2 + (cell.y - cy) ** 2 + (cell.z - cz) ** 2;
  return -d;
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function orderEmpties(
  empties: CellCoord[],
  dims: BoardDims,
  prefer: CellCoord | null,
  killer: CellCoord | null,
): CellCoord[] {
  return [...empties].sort((a, b) => {
    if (prefer) {
      if (sameCell(a, prefer)) return -1;
      if (sameCell(b, prefer)) return 1;
    }
    if (killer) {
      if (sameCell(a, killer)) return -1;
      if (sameCell(b, killer)) return 1;
    }
    return centerBias(b, dims) - centerBias(a, dims);
  });
}

/** Score open win-windows: unblocked own marks positive, opponent negative. */
function evaluate(board: Board, dims: BoardDims, aiPlayer: PlayerId): number {
  const need = winLength(dims);
  const human = opponentOf(aiPlayer);
  let score = 0;

  for (const dir of LINE_DIRECTIONS) {
    for (let x = 0; x < dims.x; x++) {
      for (let y = 0; y < dims.y; y++) {
        for (let z = 0; z < dims.z; z++) {
          const ex = x + (need - 1) * dir.x;
          const ey = y + (need - 1) * dir.y;
          const ez = z + (need - 1) * dir.z;
          if (ex < 0 || ey < 0 || ez < 0 || ex >= dims.x || ey >= dims.y || ez >= dims.z) {
            continue;
          }

          let ours = 0;
          let theirs = 0;
          for (let i = 0; i < need; i++) {
            const owner = board.get(cellKey(x + i * dir.x, y + i * dir.y, z + i * dir.z));
            if (owner === aiPlayer) ours++;
            else if (owner === human) theirs++;
          }
          if (ours > 0 && theirs > 0) continue;
          if (ours > 0) {
            score += ours === need - 1 ? THREAT_SCORE : 10 ** ours;
          } else if (theirs > 0) {
            // Slightly overweight opponent threats so defense isn't undervalued.
            score -= theirs === need - 1 ? THREAT_SCORE * 1.05 : 10 ** theirs;
          }
        }
      }
    }
  }

  return score;
}

type SearchResult = { score: number; move: CellCoord | null; aborted: boolean };

type SearchContext = {
  aiPlayer: PlayerId;
  placement: PlacementMode;
  deadline: number;
  /** Best move from previous iterative-deepening ply — tried first at root. */
  pvMove: CellCoord | null;
  /** Depth of the current root search (for PV ordering). */
  rootDepth: number;
  /** One killer move per remaining-depth slot. */
  killers: (CellCoord | null)[];
  /** Zobrist keys: [cellIndex][0=a, 1=b]. */
  zobrist: Uint32Array;
  hash: number;
  /** Transposition: hash → best move seen (ordering only). */
  tt: Map<number, { move: CellCoord | null }>;
  useTt: boolean;
};

function playerZobristSlot(player: PlayerId): number {
  return player === "a" ? 0 : 1;
}

function xorPiece(ctx: SearchContext, dims: BoardDims, cell: CellCoord, player: PlayerId) {
  const idx = cellIndex(cell, dims) * 2 + playerZobristSlot(player);
  ctx.hash ^= ctx.zobrist[idx]!;
}

function buildZobrist(dims: BoardDims): Uint32Array {
  const n = cellCount(dims) * 2;
  const table = new Uint32Array(n);
  // Deterministic LCG so TT behavior is stable across calls (not crypto).
  let s = 0x9e3779b9;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    table[i] = s;
  }
  return table;
}

function hashBoard(board: Board, dims: BoardDims, zobrist: Uint32Array): number {
  let h = 0;
  for (const [key, player] of board) {
    const [xs, ys, zs] = key.split(",");
    const cell = { x: Number(xs), y: Number(ys), z: Number(zs) };
    const idx = cellIndex(cell, dims) * 2 + playerZobristSlot(player);
    h ^= zobrist[idx]!;
  }
  return h;
}

function minimax(
  board: Board,
  dims: BoardDims,
  toMove: PlayerId,
  depthLeft: number,
  occupiedCount: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): SearchResult {
  if (performance.now() >= ctx.deadline) {
    return { score: 0, move: null, aborted: true };
  }

  // TT is move-ordering only (no score cutoffs) — avoids incorrect α-β reuse.
  const ttHit = ctx.useTt ? ctx.tt.get(ctx.hash) : undefined;
  const prefer = depthLeft === ctx.rootDepth ? ctx.pvMove : null;
  const killer = ctx.killers[depthLeft] ?? null;
  const empties = orderEmpties(
    legalEmpties(board, dims, ctx.placement),
    dims,
    prefer ?? ttHit?.move ?? null,
    killer,
  );

  if (empties.length === 0 || isDraw(occupiedCount, dims)) {
    return { score: 0, move: null, aborted: false };
  }

  if (depthLeft === 0) {
    return { score: evaluate(board, dims, ctx.aiPlayer), move: null, aborted: false };
  }

  const maximizing = toMove === ctx.aiPlayer;
  let bestMove: CellCoord | null = empties[0] ?? null;
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, toMove);
    xorPiece(ctx, dims, cell, toMove);
    const win = checkWin(board, dims, cell, toMove);

    let child: SearchResult;
    if (win) {
      // Prefer faster wins / slower losses.
      const score = toMove === ctx.aiPlayer ? WIN_SCORE + depthLeft : -WIN_SCORE - depthLeft;
      child = { score, move: null, aborted: false };
    } else if (isDraw(occupiedCount + 1, dims)) {
      child = { score: 0, move: null, aborted: false };
    } else {
      child = minimax(
        board,
        dims,
        opponentOf(toMove),
        depthLeft - 1,
        occupiedCount + 1,
        alpha,
        beta,
        ctx,
      );
    }

    board.delete(key);
    xorPiece(ctx, dims, cell, toMove);

    if (child.aborted) return { score: bestScore, move: bestMove, aborted: true };

    const score = child.score;
    if (maximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = cell;
      }
      alpha = Math.max(alpha, bestScore);
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = cell;
      }
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) {
      ctx.killers[depthLeft] = cell;
      break;
    }
  }

  if (ctx.useTt && bestMove) {
    ctx.tt.set(ctx.hash, { move: bestMove });
  }

  return { score: bestScore, move: bestMove, aborted: false };
}

function defaultMaxDepth(dims: BoardDims, difficulty: "hard" | "extreme"): number {
  const total = cellCount(dims);
  if (difficulty === "extreme") {
    if (total <= 27) return EXTREME_SMALL_DEPTH;
    if (total <= 64) return EXTREME_MID_DEPTH;
    return EXTREME_LARGE_DEPTH;
  }
  return total <= 27 ? HARD_DEEP_DEPTH : HARD_SHALLOW_DEPTH;
}

function defaultBudget(difficulty: "hard" | "extreme"): number {
  return difficulty === "extreme" ? EXTREME_BUDGET_MS : HARD_BUDGET_MS;
}

function searchMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  occupiedCount: number,
  placement: PlacementMode,
  options: AiSearchOptions,
  rng: Rng,
  difficulty: "hard" | "extreme",
): CellCoord | null {
  const forced = forcedTacticalMove(board, dims, aiPlayer, empties, placement);
  if (forced) return forced;

  const total = cellCount(dims);
  const defaultCap = defaultMaxDepth(dims, difficulty);
  const maxDepth = Math.min(options.maxDepth ?? defaultCap, total - occupiedCount);
  const budget = options.budgetMs ?? defaultBudget(difficulty);
  const deadline = performance.now() + budget;
  const useTt = difficulty === "extreme";
  const zobrist = buildZobrist(dims);

  const ctx: SearchContext = {
    aiPlayer,
    placement,
    deadline,
    pvMove: null,
    rootDepth: 1,
    killers: Array.from({ length: maxDepth + 1 }, () => null),
    zobrist,
    hash: hashBoard(board, dims, zobrist),
    tt: new Map(),
    useTt,
  };

  let best = pickRandom(empties, rng);
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() >= deadline) break;
    ctx.rootDepth = depth;
    const result = minimax(board, dims, aiPlayer, depth, occupiedCount, -Infinity, Infinity, ctx);
    if (result.aborted) break;
    if (result.move) {
      best = result.move;
      ctx.pvMove = result.move;
    }
  }
  return best;
}

function mediumMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
  rng: Rng,
): CellCoord | null {
  const forced = forcedTacticalMove(board, dims, aiPlayer, empties, placement);
  if (forced) return forced;
  const threat = findThreatMove(board, dims, aiPlayer, empties, placement, rng);
  if (threat) return threat;
  return pickRandom(empties, rng);
}

function easyMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  occupiedCount: number,
  placement: PlacementMode,
  rng: Rng,
  seeded: boolean,
): CellCoord | null {
  if (rng() < EASY_RANDOM_RATE) {
    if (placement === "drop" || seeded) return pickRandom(empties, rng);
    return randomEmptyCell(board, dims, occupiedCount) ?? pickRandom(empties, rng);
  }
  return tacticalMove(board, dims, aiPlayer, empties) ?? pickRandom(empties, rng);
}

export function pickAiMove(
  board: Board,
  dims: BoardDims,
  difficulty: AiDifficulty,
  aiPlayer: PlayerId,
  occupiedCount: number,
  placement: PlacementMode = "free",
  options: AiSearchOptions = {},
): CellCoord | null {
  const empties = legalEmpties(board, dims, placement);
  if (empties.length === 0) return null;
  const rng = options.rng ?? Math.random;
  const seeded = options.rng != null;

  switch (difficulty) {
    case "easy":
      return easyMove(board, dims, aiPlayer, empties, occupiedCount, placement, rng, seeded);
    case "medium":
      return mediumMove(board, dims, aiPlayer, empties, placement, rng);
    case "hard":
      return searchMove(board, dims, aiPlayer, empties, occupiedCount, placement, options, rng, "hard");
    case "extreme":
      return searchMove(
        board,
        dims,
        aiPlayer,
        empties,
        occupiedCount,
        placement,
        options,
        rng,
        "extreme",
      );
  }
}
