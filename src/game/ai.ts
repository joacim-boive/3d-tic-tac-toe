import {
  cellKey,
  checkWin,
  isDraw,
  LINE_DIRECTIONS,
  listEmptyCells,
  randomEmptyCell,
  type Board,
} from "./board";
import type { AiDifficulty, BoardDims, CellCoord, PlayerId } from "./types";
import { cellCount, winLength } from "./types";

const EASY_RANDOM_RATE = 0.7;
const HARD_SHALLOW_DEPTH = 3;
const WIN_SCORE = 1_000_000;

function opponentOf(player: PlayerId): PlayerId {
  return player === "a" ? "b" : "a";
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
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
): CellCoord | null {
  const threats: CellCoord[] = [];
  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, aiPlayer);
    const followUps = empties.filter((c) => c.x !== cell.x || c.y !== cell.y || c.z !== cell.z);
    const threatens = findWinningMove(board, dims, aiPlayer, followUps) !== null;
    board.delete(key);
    if (threatens) threats.push(cell);
  }
  return pickRandom(threats);
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

type SearchResult = { score: number; move: CellCoord | null };

function minimax(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  toMove: PlayerId,
  depthLeft: number,
  occupiedCount: number,
  alpha: number,
  beta: number,
  useHeuristic: boolean,
): SearchResult {
  const empties = orderEmpties(listEmptyCells(board, dims), dims);
  if (empties.length === 0 || isDraw(occupiedCount, dims)) {
    return { score: 0, move: null };
  }

  if (depthLeft === 0 && useHeuristic) {
    return { score: evaluate(board, dims, aiPlayer), move: null };
  }

  const maximizing = toMove === aiPlayer;
  let bestMove: CellCoord | null = empties[0] ?? null;
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, toMove);
    const win = checkWin(board, dims, cell, toMove);

    let score: number;
    if (win) {
      // Prefer faster wins / slower losses.
      score = toMove === aiPlayer ? WIN_SCORE + depthLeft : -WIN_SCORE - depthLeft;
    } else if (isDraw(occupiedCount + 1, dims)) {
      score = 0;
    } else if (depthLeft === 0) {
      score = useHeuristic ? evaluate(board, dims, aiPlayer) : 0;
    } else {
      score = minimax(
        board,
        dims,
        aiPlayer,
        opponentOf(toMove),
        depthLeft - 1,
        occupiedCount + 1,
        alpha,
        beta,
        useHeuristic,
      ).score;
    }

    board.delete(key);

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

  return { score: bestScore, move: bestMove };
}

function hardMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  occupiedCount: number,
): CellCoord | null {
  const tactical = tacticalMove(board, dims, aiPlayer, empties);
  if (tactical) return tactical;

  const total = cellCount(dims);
  const fullSearch = total <= 27;
  const depth = fullSearch ? total - occupiedCount : HARD_SHALLOW_DEPTH;

  const result = minimax(
    board,
    dims,
    aiPlayer,
    aiPlayer,
    depth,
    occupiedCount,
    -Infinity,
    Infinity,
    !fullSearch,
  );
  return result.move ?? pickRandom(empties);
}

function mediumMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
): CellCoord | null {
  const tactical = tacticalMove(board, dims, aiPlayer, empties);
  if (tactical) return tactical;
  const threat = findThreatMove(board, dims, aiPlayer, empties);
  if (threat) return threat;
  return pickRandom(empties);
}

function easyMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  occupiedCount: number,
): CellCoord | null {
  if (Math.random() < EASY_RANDOM_RATE) {
    return randomEmptyCell(board, dims, occupiedCount) ?? pickRandom(empties);
  }
  return tacticalMove(board, dims, aiPlayer, empties) ?? pickRandom(empties);
}

export function pickAiMove(
  board: Board,
  dims: BoardDims,
  difficulty: AiDifficulty,
  aiPlayer: PlayerId,
  occupiedCount: number,
): CellCoord | null {
  const empties = listEmptyCells(board, dims);
  if (empties.length === 0) return null;

  switch (difficulty) {
    case "easy":
      return easyMove(board, dims, aiPlayer, empties, occupiedCount);
    case "medium":
      return mediumMove(board, dims, aiPlayer, empties);
    case "hard":
      return hardMove(board, dims, aiPlayer, empties, occupiedCount);
  }
}
