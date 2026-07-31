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
import type { AiDifficulty, BoardDims, CellCoord, PlacementMode, PlayerId } from "./types";
import { cellCount, winLength } from "./types";

const EASY_RANDOM_RATE = 0.7;
/** Depth for boards larger than 3×3×3. */
const HARD_SHALLOW_DEPTH = 3;
/** Cap for 3×3×3 — full endgame search freezes Mobile Safari (main-thread watchdog). */
const HARD_DEEP_DEPTH = 5;
/** Soft wall-clock budget; iterative deepening stops when exceeded. */
const HARD_BUDGET_MS = 80;
const WIN_SCORE = 1_000_000;

export type Rng = () => number;

/** Optional overrides for offline eval / self-play (browser defaults unchanged). */
export type AiSearchOptions = {
  rng?: Rng;
  /** Hard search wall-clock budget in ms. Use Infinity to finish each depth. */
  budgetMs?: number;
  /** Cap iterative-deepening depth for Hard. */
  maxDepth?: number;
};

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

function orderEmpties(empties: CellCoord[], dims: BoardDims): CellCoord[] {
  return [...empties].sort((a, b) => centerBias(b, dims) - centerBias(a, dims));
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
          if (ours > 0) score += 10 ** ours;
          else if (theirs > 0) score -= 10 ** theirs;
        }
      }
    }
  }

  return score;
}

type SearchResult = { score: number; move: CellCoord | null; aborted: boolean };

function minimax(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  toMove: PlayerId,
  depthLeft: number,
  occupiedCount: number,
  alpha: number,
  beta: number,
  deadline: number,
  placement: PlacementMode,
): SearchResult {
  if (performance.now() >= deadline) {
    return { score: 0, move: null, aborted: true };
  }

  const empties = orderEmpties(legalEmpties(board, dims, placement), dims);
  if (empties.length === 0 || isDraw(occupiedCount, dims)) {
    return { score: 0, move: null, aborted: false };
  }

  if (depthLeft === 0) {
    return { score: evaluate(board, dims, aiPlayer), move: null, aborted: false };
  }

  const maximizing = toMove === aiPlayer;
  let bestMove: CellCoord | null = empties[0] ?? null;
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, toMove);
    const win = checkWin(board, dims, cell, toMove);

    let child: SearchResult;
    if (win) {
      // Prefer faster wins / slower losses.
      const score = toMove === aiPlayer ? WIN_SCORE + depthLeft : -WIN_SCORE - depthLeft;
      child = { score, move: null, aborted: false };
    } else if (isDraw(occupiedCount + 1, dims)) {
      child = { score: 0, move: null, aborted: false };
    } else {
      child = minimax(
        board,
        dims,
        aiPlayer,
        opponentOf(toMove),
        depthLeft - 1,
        occupiedCount + 1,
        alpha,
        beta,
        deadline,
        placement,
      );
    }

    board.delete(key);

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
    if (beta <= alpha) break;
  }

  return { score: bestScore, move: bestMove, aborted: false };
}

function hardMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  occupiedCount: number,
  placement: PlacementMode,
  options: AiSearchOptions,
  rng: Rng,
): CellCoord | null {
  const tactical = tacticalMove(board, dims, aiPlayer, empties);
  if (tactical) return tactical;

  const total = cellCount(dims);
  // ponytail: full endgame α-β on 3×3×3 hangs Safari; deepen within a budget instead.
  const defaultCap = total <= 27 ? HARD_DEEP_DEPTH : HARD_SHALLOW_DEPTH;
  const maxDepth = Math.min(options.maxDepth ?? defaultCap, total - occupiedCount);
  const budget = options.budgetMs ?? HARD_BUDGET_MS;
  const deadline = performance.now() + budget;

  let best = pickRandom(empties, rng);
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() >= deadline) break;
    const result = minimax(
      board,
      dims,
      aiPlayer,
      aiPlayer,
      depth,
      occupiedCount,
      -Infinity,
      Infinity,
      deadline,
      placement,
    );
    if (result.aborted) break;
    if (result.move) best = result.move;
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
  const tactical = tacticalMove(board, dims, aiPlayer, empties);
  if (tactical) return tactical;
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
      return hardMove(board, dims, aiPlayer, empties, occupiedCount, placement, options, rng);
  }
}
