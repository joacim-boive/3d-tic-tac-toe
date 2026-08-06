/**
 * AI power-up spend policy — static heuristics (no LLM).
 * Clear/Tip consume the turn; Extra turn adds a second place.
 */
import { evaluate } from "./ai";
import { cellKey, checkWin, listDropLandings, listEmptyCells, type Board } from "./board";
import { axisLineCells, clearAxisLine, CLEAR_AXES, repackDrop, type Axis } from "./clearRow";
import { canSpend, isPowerUpAllowed, type PowerUpCounts } from "./powerUps";
import { canTipPreset, tipBoard, tipChoices, type TipDown } from "./tipBoard";
import type {
  AiDifficulty,
  BoardDims,
  CellCoord,
  PlacementMode,
  PlayerId,
  PresetId,
} from "./types";

export type AiPowerUpDecision =
  | { action: "none" }
  | { action: "extra-turn" }
  | { action: "clear-row"; axis: Axis; a: number; b: number }
  | { action: "tip"; toDown: TipDown };

export type AiPowerUpContext = {
  board: Board;
  dims: BoardDims;
  aiPlayer: PlayerId;
  inventory: PowerUpCounts;
  placement: PlacementMode;
  difficulty: AiDifficulty;
  bonusPlacesRemaining: number;
  /** True after the ordinary place this turn — Extra may extend; Clear/Tip may not. */
  placedThisTurn: boolean;
  presetId: PresetId;
};

type ScoredClear = {
  axis: Axis;
  a: number;
  b: number;
  score: number;
};

type ScoredTip = {
  toDown: TipDown;
  score: number;
};

function opponentOf(player: PlayerId): PlayerId {
  return player === "a" ? "b" : "a";
}

function legalEmpties(board: Board, dims: BoardDims, placement: PlacementMode): CellCoord[] {
  return placement === "drop" ? listDropLandings(board, dims) : listEmptyCells(board, dims);
}

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

function applyClear(
  board: Board,
  dims: BoardDims,
  placement: PlacementMode,
  axis: Axis,
  a: number,
  b: number,
): Board {
  let next = clearAxisLine(board, dims, axis, a, b);
  if (placement === "drop") next = repackDrop(next, dims);
  return next;
}

function lineOccupancy(
  board: Board,
  dims: BoardDims,
  axis: Axis,
  a: number,
  b: number,
  aiPlayer: PlayerId,
): { ours: number; theirs: number; empty: number } {
  const human = opponentOf(aiPlayer);
  let ours = 0;
  let theirs = 0;
  let empty = 0;
  for (const cell of axisLineCells(dims, axis, a, b)) {
    const owner = board.get(cellKey(cell.x, cell.y, cell.z));
    if (owner === aiPlayer) ours++;
    else if (owner === human) theirs++;
    else empty++;
  }
  return { ours, theirs, empty };
}

/**
 * Score a clear: must hit opponent marks; prefer breaking threats / forks;
 * never wipe own-only or empty lines.
 */
function scoreClearLine(
  board: Board,
  dims: BoardDims,
  placement: PlacementMode,
  aiPlayer: PlayerId,
  axis: Axis,
  a: number,
  b: number,
  baseline: number,
  humanThreatsBefore: number,
): number | null {
  const { ours, theirs } = lineOccupancy(board, dims, axis, a, b, aiPlayer);
  if (theirs === 0) return null;
  // Don't clear a line that costs more of our marks than theirs unless it
  // is the only way to break a multi-threat (scored below).
  if (ours > theirs && humanThreatsBefore < 2) return null;

  const next = applyClear(board, dims, placement, axis, a, b);
  const emptiesAfter = legalEmpties(next, dims, placement);
  const human = opponentOf(aiPlayer);
  const humanThreatsAfter = countWinningReplies(next, dims, human, emptiesAfter);
  const evalAfter = evaluate(next, dims, aiPlayer, placement);
  const evalDelta = evalAfter - baseline;

  let score = theirs * 120 - ours * 140 + evalDelta;

  // Breaking an immediate loss / fork is worth burning the clear.
  if (humanThreatsBefore >= 2 && humanThreatsAfter < 2) score += 50_000;
  else if (humanThreatsBefore >= 1 && humanThreatsAfter === 0) score += 8_000;

  // Soft prefer clears that don't gut our own structure.
  if (ours === 0) score += 80;
  if (theirs >= 2) score += 60 * (theirs - 1);

  return score;
}

function bestClear(
  board: Board,
  dims: BoardDims,
  placement: PlacementMode,
  aiPlayer: PlayerId,
): ScoredClear | null {
  const baseline = evaluate(board, dims, aiPlayer, placement);
  const empties = legalEmpties(board, dims, placement);
  const humanThreatsBefore = countWinningReplies(board, dims, opponentOf(aiPlayer), empties);

  let best: ScoredClear | null = null;

  for (const axis of CLEAR_AXES) {
    const aMax = axis === "x" ? dims.y : axis === "y" ? dims.x : dims.x;
    const bMax = axis === "x" ? dims.z : axis === "y" ? dims.z : dims.y;
    for (let a = 0; a < aMax; a++) {
      for (let b = 0; b < bMax; b++) {
        const score = scoreClearLine(
          board,
          dims,
          placement,
          aiPlayer,
          axis,
          a,
          b,
          baseline,
          humanThreatsBefore,
        );
        if (score === null) continue;
        if (!best || score > best.score) best = { axis, a, b, score };
      }
    }
  }

  return best;
}

/**
 * Extra may only fire after the ordinary place, and the bonus ball cannot
 * finish a line — so we only spend it to plant a non-winning fork / dual threat.
 */
function shouldUseExtraBonus(
  board: Board,
  dims: BoardDims,
  placement: PlacementMode,
  aiPlayer: PlayerId,
): boolean {
  const empties = legalEmpties(board, dims, placement);
  for (const cell of empties) {
    const key = cellKey(cell.x, cell.y, cell.z);
    board.set(key, aiPlayer);
    if (checkWin(board, dims, cell, aiPlayer)) {
      // Bonus place cannot clinch — skip finishing cells.
      board.delete(key);
      continue;
    }
    const followUps = legalEmpties(board, dims, placement);
    if (countWinningReplies(board, dims, aiPlayer, followUps) >= 2) {
      board.delete(key);
      return true;
    }
    board.delete(key);
  }
  return false;
}

function bestTip(
  board: Board,
  dims: BoardDims,
  placement: PlacementMode,
  aiPlayer: PlayerId,
): ScoredTip | null {
  if (!canTipPreset(dims)) return null;

  const baseline = evaluate(board, dims, aiPlayer, placement);
  const empties = legalEmpties(board, dims, placement);
  const human = opponentOf(aiPlayer);
  const humanThreatsBefore = countWinningReplies(board, dims, human, empties);

  let best: ScoredTip | null = null;

  for (const toDown of tipChoices()) {
    let next = tipBoard(board, dims, toDown);
    if (placement === "drop") next = repackDrop(next, dims);

    // Never tip into an immediate opponent win-on-board (repack / settle).
    // Tip alone doesn't place, but a tipped+repacked board can already contain a line.
    const evalAfter = evaluate(next, dims, aiPlayer, placement);
    const emptiesAfter = legalEmpties(next, dims, placement);
    const humanThreatsAfter = countWinningReplies(next, dims, human, emptiesAfter);
    const ourThreatsAfter = countWinningReplies(next, dims, aiPlayer, emptiesAfter);

    let score = evalAfter - baseline;
    if (humanThreatsBefore >= 2 && humanThreatsAfter < 2) score += 40_000;
    else if (humanThreatsBefore >= 1 && humanThreatsAfter === 0) score += 6_000;
    if (ourThreatsAfter >= 2) score += 12_000;
    else if (ourThreatsAfter >= 1) score += 2_000;
    // Penalize creating opponent forks.
    if (humanThreatsAfter >= 2 && humanThreatsAfter > humanThreatsBefore) score -= 40_000;

    if (!best || score > best.score) best = { toDown, score };
  }

  return best;
}

function clearThreshold(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case "easy":
      return 8_000; // only near-forced defense
    case "medium":
      return 400;
    case "hard":
      return 250;
    case "extreme":
      return 180;
    case "impossible":
      return 120;
  }
}

function tipThreshold(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case "easy":
      return Number.POSITIVE_INFINITY; // Easy never tips
    case "medium":
      return 8_000;
    case "hard":
      return 3_000;
    case "extreme":
      return 1_500;
    case "impossible":
      return 800;
  }
}

/**
 * Choose whether to spend a banked power-up before (or instead of) placing.
 * Returns `none` when placing normally is better.
 */
export function pickAiPowerUpSpend(ctx: AiPowerUpContext): AiPowerUpDecision {
  const {
    board,
    dims,
    aiPlayer,
    inventory,
    placement,
    difficulty,
    bonusPlacesRemaining,
    placedThisTurn,
    presetId,
  } = ctx;

  // Extra only after the ordinary place; Clear/Tip only before it.
  if (placedThisTurn) {
    if (
      difficulty !== "easy" &&
      isPowerUpAllowed("extra-turn", presetId) &&
      canSpend(inventory, "extra-turn") &&
      bonusPlacesRemaining === 0 &&
      shouldUseExtraBonus(board, dims, placement, aiPlayer)
    ) {
      return { action: "extra-turn" };
    }
    return { action: "none" };
  }

  if (difficulty === "easy") {
    // Easy: only clear to break a double threat; never Extra/Tip gambling.
    if (canSpend(inventory, "clear-row")) {
      const empties = legalEmpties(board, dims, placement);
      const threats = countWinningReplies(board, dims, opponentOf(aiPlayer), empties);
      if (threats >= 2) {
        const clear = bestClear(board, dims, placement, aiPlayer);
        if (clear && clear.score >= clearThreshold("easy")) {
          return { action: "clear-row", axis: clear.axis, a: clear.a, b: clear.b };
        }
      }
    }
    return { action: "none" };
  }

  const empties = legalEmpties(board, dims, placement);
  const humanThreats = countWinningReplies(board, dims, opponentOf(aiPlayer), empties);
  const clear = canSpend(inventory, "clear-row")
    ? bestClear(board, dims, placement, aiPlayer)
    : null;

  // Clear to break forks / multi-threats, or opportunistic when no urgent block.
  if (clear && clear.score >= clearThreshold(difficulty)) {
    if (humanThreats >= 2) {
      return { action: "clear-row", axis: clear.axis, a: clear.a, b: clear.b };
    }
    // A single immediate threat is cheaper to block by placing — keep Clear banked.
    if (humanThreats === 0 && clear.score >= clearThreshold(difficulty) + 100) {
      return { action: "clear-row", axis: clear.axis, a: clear.a, b: clear.b };
    }
  }

  // Tip last — high bar; swingy and spends the turn.
  if (canSpend(inventory, "tip") && canTipPreset(dims)) {
    const tip = bestTip(board, dims, placement, aiPlayer);
    if (tip && tip.score >= tipThreshold(difficulty)) {
      return { action: "tip", toDown: tip.toDown };
    }
  }

  return { action: "none" };
}
