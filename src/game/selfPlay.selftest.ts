/**
 * Smoke self-check for self-play eval harness — run with `npm run check:selfplay`.
 */
import { getPreset } from "./presets";
import {
  createRng,
  formatSelfPlayReport,
  playOneGame,
  runSelfPlay,
  topOpenings,
} from "./selfPlay";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testRngDeterministic() {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 20; i++) {
    assert(a() === b(), "same seed must yield same stream");
  }
}

function testSingleGameTerminates() {
  const dims = getPreset("3x3x3").dims;
  const search = { rng: createRng(1) };
  const result = playOneGame(dims, "free", "medium", "medium", search, search, 2);
  assert(result.plies >= 5, "3×3×3 games should last at least 5 plies");
  assert(result.plies <= 27, "cannot exceed board size");
  assert(result.opening.includes(","), "opening fingerprint should list cells");
}

function testBatchRatesSum() {
  const dims = getPreset("3x3x3").dims;
  const stats = runSelfPlay({
    dims,
    placement: "drop",
    games: 40,
    difficulty: "medium",
    seed: 7,
    openingPlies: 2,
  });
  assert(stats.games === 40, "game count");
  assert(
    stats.firstWins + stats.secondWins + stats.draws === 40,
    "outcomes must partition games",
  );
  assert(stats.totalPlies > 0, "played plies");
  assert(stats.openings.size >= 1, "should record openings");
  const tops = topOpenings(stats.openings, 3);
  assert(tops.length >= 1, "top openings");
  // Report should be printable.
  const report = formatSelfPlayReport(stats, {
    label: "3×3×3",
    placement: "drop",
    difficulty: "medium",
  });
  assert(report.includes("First (Coral) wins"), "report headline");
}

function testLargerPresetDrop() {
  const dims = getPreset("4x4x4").dims;
  const stats = runSelfPlay({
    dims,
    placement: "drop",
    games: 12,
    difficulty: "medium",
    seed: 99,
  });
  assert(stats.firstWins + stats.secondWins + stats.draws === 12, "4×4×4 drop partition");
}

function testMatchupTracksPrimaryWins() {
  const dims = getPreset("3x3x3").dims;
  const stats = runSelfPlay({
    dims,
    placement: "free",
    games: 20,
    difficulty: "medium",
    vsDifficulty: "easy",
    swapSeats: true,
    seed: 3,
  });
  assert(stats.primaryWins + stats.opponentWins + stats.draws === 20, "matchup partition");
  assert(stats.primaryWins > stats.opponentWins, "medium should beat easy overall");
  const report = formatSelfPlayReport(stats, {
    label: "3×3×3",
    placement: "free",
    difficulty: "medium",
    vsDifficulty: "easy",
    swapSeats: true,
  });
  assert(report.includes("medium vs easy"), "matchup headline");
  assert(report.includes("Primary (medium) wins"), "primary line");
}

testRngDeterministic();
testSingleGameTerminates();
testBatchRatesSum();
testLargerPresetDrop();
testMatchupTracksPrimaryWins();
console.log("selfPlay.selftest: ok");
