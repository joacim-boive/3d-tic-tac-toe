import {
  cellKey,
  checkWin,
  isDraw,
  LINE_DIRECTIONS,
  listDropLandings,
  listEmptyCells,
  parseCellKey,
  randomEmptyCell,
  type Board,
} from "./board";
import type {
  AiDifficulty,
  BoardDims,
  CellCoord,
  PlacementMode,
  PlayerId,
  PresetId,
} from "./types";
import { cellCount, winLength } from "./types";

const EASY_RANDOM_RATE = 0.7;
/** Depth for boards larger than 3×3×3 (Hard). */
const HARD_SHALLOW_DEPTH = 4;
/** Cap for 3×3×3 — full endgame search freezes Mobile Safari (main-thread watchdog). */
const HARD_DEEP_DEPTH = 5;
/** Soft wall-clock budget; iterative deepening stops when exceeded. */
const HARD_BUDGET_MS = 80;

/** Extreme: 5×5×4 and similar large boards. */
const EXTREME_LARGE_DEPTH = 6;
/** Extreme: 4×4×4 mid-size. */
const EXTREME_MID_DEPTH = 8;
/** Extreme: 3×3×3 if ever invoked (UI hides it there). */
const EXTREME_SMALL_DEPTH = 9;
/**
 * Extreme thinks harder than Hard — still bounded for Mobile Safari.
 * Aim: Hard→Extreme gap similar to Medium→Hard (~+10pp seat-averaged).
 */
const EXTREME_BUDGET_MS = 900;
/** Extra plies Extreme may add along forcing (threat) lines. */
const EXTREME_THREAT_EXTENSIONS = 1;

/** Impossible: large boards. */
const IMPOSSIBLE_LARGE_DEPTH = 8;
/** Impossible: 4×4×4. */
const IMPOSSIBLE_MID_DEPTH = 12;
/** Impossible: 3×3×3 if ever invoked. */
const IMPOSSIBLE_SMALL_DEPTH = 13;
/**
 * Impossible burns a long think — near the Mobile Safari comfort edge.
 * Aimed at a clearer step above Extreme than think-time alone (~3.5s) delivered.
 */
const IMPOSSIBLE_BUDGET_MS = 5000;
const IMPOSSIBLE_THREAT_EXTENSIONS = 2;
/** Impossible only: resolve immediate wins/blocks at leaves. */
const IMPOSSIBLE_QUIESCE_PLIES = 6;

const WIN_SCORE = 1_000_000;
/** Leaf bonus for an open (need − 1) window — creates an immediate threat next ply. */
const THREAT_SCORE = 80_000;
/**
 * Geometric center pull per occupied cell. Pure window-counts overvalue corners
 * on win-length-sized boards (space diagonals), which made Drop open on a floor
 * corner. Threats still dwarf this (80k).
 */
const POSITIONAL_WEIGHT = 10;
/** Soft history bonus so quiet cutoffs reorder well across iterative deepening. */
const HISTORY_WEIGHT = 4;

export type Rng = () => number;

/** Optional overrides for offline eval / self-play (browser defaults unchanged). */
export type AiSearchOptions = {
  rng?: Rng;
  /** Search wall-clock budget in ms. Use Infinity to finish each depth. */
  budgetMs?: number;
  /** Cap iterative-deepening depth. */
  maxDepth?: number;
};

type SearchTier = "hard" | "extreme" | "impossible";

/** Extreme / Impossible are offered on boards larger than classic 3×3×3. */
export function isExtremeAllowed(presetId: PresetId): boolean {
  return presetId !== "3x3x3";
}

/** Same board gate as Extreme — Impossible is the tier above it. */
export function isImpossibleAllowed(presetId: PresetId): boolean {
  return isExtremeAllowed(presetId);
}

function isAdvancedSearch(difficulty: SearchTier): boolean {
  return difficulty === "extreme" || difficulty === "impossible";
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

/** Immediate winning replies `player` has from this position (capped). */
function listWinningReplies(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties: CellCoord[],
  cap = 3,
): CellCoord[] {
  const wins: CellCoord[] = [];
  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, player);
    const win = checkWin(board, dims, cell, player);
    board.delete(key);
    if (win) {
      wins.push(cell);
      if (wins.length >= cap) return wins;
    }
  }
  return wins;
}

/** How many immediate winning replies `player` has from this position. */
function countWinningReplies(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties: CellCoord[],
): number {
  return listWinningReplies(board, dims, player, empties, 2).length;
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

/**
 * Force-then-finish: play a single threat whose only block still leaves a win or fork.
 * Shallow α-β under a mobile budget often misses this 3-ply pattern on 4×4×4 diagonals.
 */
function isTwoPlyForceAt(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  cell: CellCoord,
  empties: CellCoord[],
  placement: PlacementMode,
): boolean {
  const opp = opponentOf(player);
  const key = cellKey(cell.x, cell.y, cell.z);
  if (board.has(key)) return false;

  board.set(key, player);
  if (checkWin(board, dims, cell, player)) {
    board.delete(key);
    return false;
  }

  const replies = legalEmpties(board, dims, placement);
  if (findWinningMove(board, dims, opp, replies)) {
    board.delete(key);
    return false;
  }

  const threats = listWinningReplies(board, dims, player, replies, 2);
  if (threats.length !== 1) {
    board.delete(key);
    return false;
  }

  const block = threats[0]!;
  const blockKey = cellKey(block.x, block.y, block.z);
  board.set(blockKey, opp);
  const followUps = legalEmpties(board, dims, placement);
  const finishes =
    findWinningMove(board, dims, player, followUps) !== null ||
    findForkMove(board, dims, player, followUps, placement) !== null;
  board.delete(blockKey);
  board.delete(key);
  return finishes;
}

export function findTwoPlyForceMove(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
): CellCoord | null {
  for (const cell of empties) {
    if (isTwoPlyForceAt(board, dims, player, cell, empties, placement)) return cell;
  }
  return null;
}

/**
 * Quiet place that leaves ≥2 distinct force-then-fork replies.
 * Opponent can spoil only one — decisive setup for Impossible.
 */
function findDualForceSetupMove(
  board: Board,
  dims: BoardDims,
  player: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
): CellCoord | null {
  const opp = opponentOf(player);
  if (empties.length > 32) return null;

  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, player);
    if (checkWin(board, dims, cell, player)) {
      board.delete(key);
      continue;
    }

    const replies = legalEmpties(board, dims, placement);
    if (findWinningMove(board, dims, opp, replies)) {
      board.delete(key);
      continue;
    }
    if (countWinningReplies(board, dims, player, replies) > 0) {
      board.delete(key);
      continue;
    }

    let forces = 0;
    for (const follow of replies) {
      if (isTwoPlyForceAt(board, dims, player, follow, replies, placement)) {
        forces += 1;
        if (forces >= 2) {
          board.delete(key);
          return cell;
        }
      }
    }
    board.delete(key);
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
 * Extreme+: own force-then-fork. Impossible also blocks opponent force + dual setups.
 */
function forcedTacticalMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
  includeTwoPly = false,
  includeTwoPlyDefend = false,
  includeDualForce = false,
): CellCoord | null {
  const basic = tacticalMove(board, dims, aiPlayer, empties);
  if (basic) return basic;

  const fork = findForkMove(board, dims, aiPlayer, empties, placement);
  if (fork) return fork;

  const human = opponentOf(aiPlayer);
  const blockFork = findForkMove(board, dims, human, empties, placement);
  if (blockFork) return blockFork;

  if (!includeTwoPly) return null;

  const force = findTwoPlyForceMove(board, dims, aiPlayer, empties, placement);
  if (force) return force;

  if (includeTwoPlyDefend) {
    const blockForce = findTwoPlyForceMove(board, dims, human, empties, placement);
    if (blockForce) return blockForce;
  }

  if (!includeDualForce) return null;

  const setup = findDualForceSetupMove(board, dims, aiPlayer, empties, placement);
  if (setup) return setup;

  return findDualForceSetupMove(board, dims, human, empties, placement);
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

/** Drop cares about column (x,z) control — height is forced by gravity. */
function dropColumnBias(cell: CellCoord, dims: BoardDims): number {
  const cx = (dims.x - 1) / 2;
  const cz = (dims.z - 1) / 2;
  return -((cell.x - cx) ** 2 + (cell.z - cz) ** 2);
}

function positionalBonus(cell: CellCoord, dims: BoardDims, placement: PlacementMode): number {
  const bias = placement === "drop" ? dropColumnBias(cell, dims) : centerBias(cell, dims);
  return POSITIONAL_WEIGHT * bias;
}

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function orderEmpties(
  empties: CellCoord[],
  dims: BoardDims,
  prefer: CellCoord | null,
  killer: CellCoord | null,
  history: Int32Array | null,
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
    if (history) {
      const ha = history[cellIndex(a, dims)] ?? 0;
      const hb = history[cellIndex(b, dims)] ?? 0;
      if (ha !== hb) return hb - ha;
    }
    return centerBias(b, dims) - centerBias(a, dims);
  });
}

/** One-ply static scores at the root — better PV starts → deeper α-β in the same budget. */
function orderRootByEval(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
  prefer: CellCoord | null,
): CellCoord[] {
  const scored = empties.map((cell) => {
    if (prefer && sameCell(cell, prefer)) {
      return { cell, score: Number.POSITIVE_INFINITY };
    }
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, aiPlayer);
    const win = checkWin(board, dims, cell, aiPlayer);
    const score = win ? WIN_SCORE : evaluate(board, dims, aiPlayer, placement);
    board.delete(key);
    return { cell, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.cell);
}

/** Score open win-windows: unblocked own marks positive, opponent negative. */
export function evaluate(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  placement: PlacementMode = "free",
  defenseScale = 1.05,
): number {
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
            // Overweight opponent threats so defense isn't undervalued.
            score -= theirs === need - 1 ? THREAT_SCORE * defenseScale : 10 ** theirs;
          }
        }
      }
    }
  }

  // Soft center / column preference — keeps Drop openings off floor corners.
  for (const [key, owner] of board) {
    const bonus = positionalBonus(parseCellKey(key), dims, placement);
    score += owner === aiPlayer ? bonus : -bonus;
  }

  return score;
}

/**
 * Best non-tactical placement by static eval (center-aware).
 * Used for Medium quiet moves and as the Hard/Extreme search seed.
 */
export function bestQuietMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode = "free",
  rng: Rng = Math.random,
): CellCoord | null {
  if (empties.length === 0) return null;

  let bestScore = -Infinity;
  const tied: CellCoord[] = [];

  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, aiPlayer);
    const win = checkWin(board, dims, cell, aiPlayer);
    const score = win ? WIN_SCORE : evaluate(board, dims, aiPlayer, placement);
    board.delete(key);

    if (score > bestScore + 1e-9) {
      bestScore = score;
      tied.length = 0;
      tied.push(cell);
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      tied.push(cell);
    }
  }

  return pickRandom(tied, rng);
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
  /** Quiet cutoff history: cellIndex → score. */
  history: Int32Array;
  /** Zobrist keys: [cellIndex][0=a, 1=b]. */
  zobrist: Uint32Array;
  hash: number;
  /** Transposition: hash → best move seen (ordering only). */
  tt: Map<number, { move: CellCoord | null }>;
  useTt: boolean;
  /** Remaining threat-extension budget along this path. */
  extensionsLeft: number;
  /** One-ply root eval ordering (Extreme+). Hard skips it to preserve depth. */
  rootEvalOrder: boolean;
  /** Extreme+: prefer immediate win/block cells in interior ordering. */
  tacticalOrder: boolean;
  /** Impossible: light win/block quiescence at leaves. */
  useQuiesce: boolean;
  quiescePlies: number;
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


/**
 * Impossible horizon: chase immediate wins and forced blocks only.
 * (Heavier quiescence previously hurt Impossible vs Extreme.)
 */
function quiesce(
  board: Board,
  dims: BoardDims,
  toMove: PlayerId,
  occupiedCount: number,
  pliesLeft: number,
  ctx: SearchContext,
): SearchResult {
  if (performance.now() >= ctx.deadline) {
    return { score: 0, move: null, aborted: true };
  }

  const standPat = evaluate(board, dims, ctx.aiPlayer, ctx.placement);
  if (pliesLeft <= 0) {
    return { score: standPat, move: null, aborted: false };
  }

  const empties = legalEmpties(board, dims, ctx.placement);
  if (empties.length === 0 || isDraw(occupiedCount, dims)) {
    return { score: 0, move: null, aborted: false };
  }

  const win = findWinningMove(board, dims, toMove, empties);
  if (win) {
    const score = toMove === ctx.aiPlayer ? WIN_SCORE + pliesLeft : -WIN_SCORE - pliesLeft;
    return { score, move: win, aborted: false };
  }

  const mustBlock = findWinningMove(board, dims, opponentOf(toMove), empties);
  if (!mustBlock) {
    return { score: standPat, move: null, aborted: false };
  }

  const key = cellKey(mustBlock.x, mustBlock.y, mustBlock.z);
  board.set(key, toMove);
  xorPiece(ctx, dims, mustBlock, toMove);
  const won = checkWin(board, dims, mustBlock, toMove);
  let child: SearchResult;
  if (won) {
    const score = toMove === ctx.aiPlayer ? WIN_SCORE + pliesLeft : -WIN_SCORE - pliesLeft;
    child = { score, move: null, aborted: false };
  } else {
    child = quiesce(board, dims, opponentOf(toMove), occupiedCount + 1, pliesLeft - 1, ctx);
  }
  board.delete(key);
  xorPiece(ctx, dims, mustBlock, toMove);
  return { score: child.score, move: mustBlock, aborted: child.aborted };
}

/**
 * True if playing `cell` hands the opponent a tactic.
 * `basic` = win/fork only (Extreme). `full` = also force-then-fork (Impossible).
 */
function givesOpponentTactic(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  cell: CellCoord,
  placement: PlacementMode,
  mode: "basic" | "full" = "full",
): boolean {
  const opp = opponentOf(aiPlayer);
  const key = cellKey(cell.x, cell.y, cell.z);
  board.set(key, aiPlayer);
  if (checkWin(board, dims, cell, aiPlayer)) {
    board.delete(key);
    return false;
  }
  const replies = legalEmpties(board, dims, placement);
  let handed =
    findWinningMove(board, dims, opp, replies) !== null ||
    findForkMove(board, dims, opp, replies, placement) !== null;
  if (mode === "full" && !handed) {
    handed = findTwoPlyForceMove(board, dims, opp, replies, placement) !== null;
  }
  board.delete(key);
  return handed;
}

/**
 * Extreme/Impossible root filter: prefer the search move, but refuse to walk into an
 * immediate opponent win/fork/force if a safer legal place exists.
 * Impossible also prefers a safe move that creates a threat of its own.
 */
function preferSafeMove(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  placement: PlacementMode,
  preferred: CellCoord | null,
  rng: Rng,
  preferThreat = false,
  safetyMode: "basic" | "full" = "full",
): CellCoord | null {
  const ordered = preferred
    ? [preferred, ...empties.filter((c) => !sameCell(c, preferred))]
    : empties;
  const safe: CellCoord[] = [];
  for (const cell of ordered) {
    if (!givesOpponentTactic(board, dims, aiPlayer, cell, placement, safetyMode)) {
      safe.push(cell);
    }
  }
  if (safe.length === 0) {
    return preferred ?? bestQuietMove(board, dims, aiPlayer, empties, placement, rng);
  }
  if (preferThreat) {
    for (const cell of safe) {
      if (isTwoPlyForceAt(board, dims, aiPlayer, cell, empties, placement)) return cell;
    }
    for (const cell of safe) {
      const key = cellKey(cell.x, cell.y, cell.z);
      board.set(key, aiPlayer);
      const replies = legalEmpties(board, dims, placement);
      const threatens = findWinningMove(board, dims, aiPlayer, replies) !== null;
      board.delete(key);
      if (threatens) return cell;
    }
  }
  return safe[0]!;
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

  const rawEmpties = legalEmpties(board, dims, ctx.placement);
  const prefer = depthLeft === ctx.rootDepth ? ctx.pvMove : null;
  const killer = ctx.killers[depthLeft] ?? null;
  // TT is move-ordering only (no score cutoffs) — avoids incorrect α-β reuse.
  const ttHit = ctx.useTt ? ctx.tt.get(ctx.hash) : undefined;
  let tacticalPrefer: CellCoord | null = null;
  let tacticalBlock: CellCoord | null = null;
  if (ctx.tacticalOrder) {
    tacticalPrefer = findWinningMove(board, dims, toMove, rawEmpties);
    tacticalBlock = findWinningMove(board, dims, opponentOf(toMove), rawEmpties);
  }
  const empties =
    depthLeft === ctx.rootDepth && ctx.rootEvalOrder && prefer == null
      ? orderRootByEval(
          board,
          dims,
          ctx.aiPlayer,
          rawEmpties,
          ctx.placement,
          ttHit?.move ?? tacticalPrefer ?? tacticalBlock ?? null,
        )
      : orderEmpties(
          rawEmpties,
          dims,
          prefer ?? tacticalPrefer ?? tacticalBlock ?? ttHit?.move ?? null,
          killer,
          ctx.history,
        );

  if (empties.length === 0 || isDraw(occupiedCount, dims)) {
    return { score: 0, move: null, aborted: false };
  }

  if (depthLeft === 0) {
    if (ctx.useQuiesce) {
      return quiesce(board, dims, toMove, occupiedCount, ctx.quiescePlies, ctx);
    }
    return {
      score: evaluate(board, dims, ctx.aiPlayer, ctx.placement),
      move: null,
      aborted: false,
    };
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
      let childDepth = depthLeft - 1;
      let restoredExtensions = ctx.extensionsLeft;
      // Threat extension near the horizon only — full-tree extensions blow the mobile budget
      // and can leave Extreme shallower than Hard under the same wall clock.
      if (
        ctx.extensionsLeft > 0 &&
        depthLeft <= 2 &&
        performance.now() + 40 < ctx.deadline
      ) {
        const replies = legalEmpties(board, dims, ctx.placement);
        if (findWinningMove(board, dims, toMove, replies) !== null) {
          childDepth += 1;
          ctx.extensionsLeft -= 1;
        }
      }
      child = minimax(
        board,
        dims,
        opponentOf(toMove),
        childDepth,
        occupiedCount + 1,
        alpha,
        beta,
        ctx,
      );
      ctx.extensionsLeft = restoredExtensions;
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
      const idx = cellIndex(cell, dims);
      ctx.history[idx] = (ctx.history[idx] ?? 0) + HISTORY_WEIGHT * depthLeft * depthLeft;
      break;
    }
  }

  if (ctx.useTt && bestMove) {
    ctx.tt.set(ctx.hash, { move: bestMove });
  }

  return { score: bestScore, move: bestMove, aborted: false };
}

/**
 * Impossible: after ID, lightly re-score a few safe root alternatives at a fixed
 * shallow depth (no quiescence). Catches PV misses from horizon/extensions without
 * the heavy multi-PV + quiescence pathology that previously lost to Extreme.
 */
function confirmImpossibleRoot(
  board: Board,
  dims: BoardDims,
  aiPlayer: PlayerId,
  empties: CellCoord[],
  occupiedCount: number,
  placement: PlacementMode,
  preferred: CellCoord,
  deadline: number,
  baseCtx: SearchContext,
): CellCoord {
  const remaining = deadline - performance.now();
  if (remaining < 400) return preferred;

  const safe = empties.filter(
    (cell) => !givesOpponentTactic(board, dims, aiPlayer, cell, placement, "full"),
  );
  if (safe.length <= 1) return preferred;

  const ordered = orderRootByEval(board, dims, aiPlayer, safe, placement, preferred).slice(
    0,
    Math.min(4, safe.length),
  );
  if (!ordered.some((c) => sameCell(c, preferred))) {
    ordered[ordered.length - 1] = preferred;
  }

  const verifyDepth = 3;
  let bestMove = preferred;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const cell of ordered) {
    if (performance.now() >= deadline) break;
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, aiPlayer);
    if (checkWin(board, dims, cell, aiPlayer)) {
      board.delete(key);
      return cell;
    }
    const childCtx: SearchContext = {
      ...baseCtx,
      deadline,
      pvMove: null,
      rootDepth: verifyDepth,
      extensionsLeft: IMPOSSIBLE_THREAT_EXTENSIONS,
      useQuiesce: false,
      quiescePlies: 0,
      killers: Array.from(baseCtx.killers, () => null),
      // Keep TT/history from ID for move ordering; scores are not stored in TT.
    };
    xorPiece(childCtx, dims, cell, aiPlayer);
    const child = minimax(
      board,
      dims,
      opponentOf(aiPlayer),
      verifyDepth,
      occupiedCount + 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      childCtx,
    );
    xorPiece(childCtx, dims, cell, aiPlayer);
    board.delete(key);
    if (child.aborted) break;
    const score = -child.score;
    if (score > bestScore) {
      bestScore = score;
      bestMove = cell;
    }
  }
  return bestMove;
}

function defaultMaxDepth(dims: BoardDims, difficulty: SearchTier): number {
  const total = cellCount(dims);
  if (difficulty === "impossible") {
    if (total <= 27) return IMPOSSIBLE_SMALL_DEPTH;
    if (total <= 64) return IMPOSSIBLE_MID_DEPTH;
    return IMPOSSIBLE_LARGE_DEPTH;
  }
  if (difficulty === "extreme") {
    if (total <= 27) return EXTREME_SMALL_DEPTH;
    if (total <= 64) return EXTREME_MID_DEPTH;
    return EXTREME_LARGE_DEPTH;
  }
  return total <= 27 ? HARD_DEEP_DEPTH : HARD_SHALLOW_DEPTH;
}

function defaultBudget(difficulty: SearchTier): number {
  if (difficulty === "impossible") return IMPOSSIBLE_BUDGET_MS;
  if (difficulty === "extreme") return EXTREME_BUDGET_MS;
  return HARD_BUDGET_MS;
}

function threatExtensions(difficulty: SearchTier): number {
  if (difficulty === "impossible") return IMPOSSIBLE_THREAT_EXTENSIONS;
  if (difficulty === "extreme") return EXTREME_THREAT_EXTENSIONS;
  return 0;
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
  difficulty: SearchTier,
): CellCoord | null {
  const advanced = isAdvancedSearch(difficulty);
  const forced = forcedTacticalMove(
    board,
    dims,
    aiPlayer,
    empties,
    placement,
    advanced,
    advanced,
    difficulty === "impossible",
  );
  if (forced) return forced;

  // Early game: shallow α-β + open-window counts overvalue corners (esp. Drop).
  // Impossible only quiets the empty-board opening; Extreme/Hard quiet two plies.
  const quietOpeningPlies = difficulty === "impossible" ? 0 : 2;
  if (occupiedCount <= quietOpeningPlies) {
    return bestQuietMove(board, dims, aiPlayer, empties, placement, rng);
  }

  const total = cellCount(dims);
  const defaultCap = defaultMaxDepth(dims, difficulty);
  const maxDepth = Math.min(options.maxDepth ?? defaultCap, total - occupiedCount);
  const budget = options.budgetMs ?? defaultBudget(difficulty);
  const deadline = performance.now() + budget;
  const useTt = advanced;
  const zobrist = buildZobrist(dims);
  const extensionsLeft = threatExtensions(difficulty);
  const maxExt = Math.max(EXTREME_THREAT_EXTENSIONS, IMPOSSIBLE_THREAT_EXTENSIONS);

  const ctx: SearchContext = {
    aiPlayer,
    placement,
    deadline,
    pvMove: null,
    rootDepth: 1,
    killers: Array.from({ length: maxDepth + maxExt + 1 }, () => null),
    history: new Int32Array(total),
    zobrist,
    hash: hashBoard(board, dims, zobrist),
    tt: new Map(),
    useTt,
    extensionsLeft,
    rootEvalOrder: advanced,
    tacticalOrder: advanced,
    useQuiesce: difficulty === "impossible",
    quiescePlies: IMPOSSIBLE_QUIESCE_PLIES,
  };

  let best = bestQuietMove(board, dims, aiPlayer, empties, placement, rng);
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() >= deadline) break;
    ctx.rootDepth = depth;
    ctx.extensionsLeft = extensionsLeft;
    const result = minimax(board, dims, aiPlayer, depth, occupiedCount, -Infinity, Infinity, ctx);
    if (result.aborted) break;
    if (result.move) {
      best = result.move;
      ctx.pvMove = result.move;
    }
  }

  if (advanced && best) {
    let pick = preferSafeMove(
      board,
      dims,
      aiPlayer,
      empties,
      placement,
      best,
      rng,
      difficulty === "impossible",
      "full",
    );
    if (difficulty === "impossible" && pick) {
      pick = confirmImpossibleRoot(
        board,
        dims,
        aiPlayer,
        empties,
        occupiedCount,
        placement,
        pick,
        deadline,
        ctx,
      );
    }
    return pick;
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
  return bestQuietMove(board, dims, aiPlayer, empties, placement, rng);
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
      return searchMove(
        board,
        dims,
        aiPlayer,
        empties,
        occupiedCount,
        placement,
        options,
        rng,
        "hard",
      );
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
    case "impossible":
      return searchMove(
        board,
        dims,
        aiPlayer,
        empties,
        occupiedCount,
        placement,
        options,
        rng,
        "impossible",
      );
  }
}
