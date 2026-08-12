/**
 * Assert-based self-check for AI level stats — `npm run check:stats`.
 */
import {
  emptyDifficultyStats,
  emptyGameStats,
  formatPlayTime,
  nextHarderDifficulty,
  parseGameStats,
  recordAiMatchResult,
  writeGameStatsToStorage,
} from "./gameStats";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testParseEmpty() {
  const stats = parseGameStats(null);
  assert(stats.byDifficulty.easy.played === 0, "empty easy");
  assert(stats.byDifficulty.extreme.wins === 0, "empty extreme");
}

function testParseValid() {
  const stats = parseGameStats({
    byDifficulty: {
      medium: { played: 4, wins: 2, losses: 1, draws: 1, totalTimeMs: 90_000 },
      junk: { played: 9 },
    },
  });
  assert(stats.byDifficulty.medium.played === 4, "played");
  assert(stats.byDifficulty.medium.wins === 2, "wins");
  assert(stats.byDifficulty.medium.losses === 1, "losses");
  assert(stats.byDifficulty.medium.draws === 1, "draws");
  assert(stats.byDifficulty.medium.totalTimeMs === 90_000, "time");
  assert(stats.byDifficulty.easy.played === 0, "missing stays empty");
}

function testParseFloor() {
  const stats = parseGameStats({
    byDifficulty: {
      hard: { played: 2.9, wins: -3, losses: 1.2, draws: NaN, totalTimeMs: "x" },
    },
  });
  assert(stats.byDifficulty.hard.played === 2, "floor played");
  assert(stats.byDifficulty.hard.wins === 0, "neg wins → 0");
  assert(stats.byDifficulty.hard.losses === 1, "floor losses");
  assert(stats.byDifficulty.hard.draws === 0, "nan draws");
  assert(stats.byDifficulty.hard.totalTimeMs === 0, "bad time");
}

function testNextHarder() {
  assert(nextHarderDifficulty("easy", "4x4x4") === "medium", "easy→medium");
  assert(nextHarderDifficulty("medium", "4x4x4") === "hard", "medium→hard");
  assert(nextHarderDifficulty("hard", "4x4x4") === "extreme", "hard→extreme");
  assert(nextHarderDifficulty("extreme", "4x4x4") === null, "extreme max");
  assert(nextHarderDifficulty("hard", "7x6") === "extreme", "flat 7×6 hard→extreme");
  assert(nextHarderDifficulty("hard", "3x3x3") === null, "3³ hard is max");
  assert(nextHarderDifficulty("medium", "3x3x3") === "hard", "3³ medium→hard");
}

function testFormatTime() {
  assert(formatPlayTime(0) === "0s", "0s");
  assert(formatPlayTime(45_000) === "45s", "45s");
  assert(formatPlayTime(125_000) === "2:05", "m:ss");
  assert(formatPlayTime(3_725_000) === "1h 02m", "h mm");
}

function testRecordRoundTrip() {
  const mem = new Map<string, string>();
  const original = globalThis.localStorage;
  const fake = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
  try {
    writeGameStatsToStorage(emptyGameStats());
    const first = recordAiMatchResult({
      difficulty: "medium",
      outcome: "win",
      durationMs: 12_500.7,
    });
    assert(first.played === 1, "first played");
    assert(first.wins === 1, "first win");
    assert(first.totalTimeMs === 12_500, "duration floored");
    const second = recordAiMatchResult({
      difficulty: "medium",
      outcome: "loss",
      durationMs: 1000,
    });
    assert(second.played === 2, "second played");
    assert(second.wins === 1 && second.losses === 1, "w/l");
    assert(second.totalTimeMs === 13_500, "time summed");
    assert(emptyDifficultyStats().played === 0, "empty helper");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: original,
      configurable: true,
    });
  }
}

testParseEmpty();
testParseValid();
testParseFloor();
testNextHarder();
testFormatTime();
testRecordRoundTrip();
console.log("gameStats.selftest ok");
