/**
 * Assert-based check for rotating vs-AI aliases — run with `npm run check:aliases`.
 */
import {
  AI_ALIASES,
  HUMAN_ALIASES,
  clearSessionHumanForTests,
  namesAt,
  nextVsAiNames,
  resetAliasCursorsForTests,
  sessionHumanAlias,
} from "./playerAliases";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testBanks() {
  assert(HUMAN_ALIASES.length >= 40, `human bank size ${HUMAN_ALIASES.length}`);
  assert(AI_ALIASES.length >= 100, `ai bank size ${AI_ALIASES.length}`);
  assert(new Set(HUMAN_ALIASES).size === HUMAN_ALIASES.length, "human unique");
  assert(new Set(AI_ALIASES).size === AI_ALIASES.length, "ai unique");
  const withAi = AI_ALIASES.filter((n) => /ai/i.test(n)).length;
  assert(withAi >= AI_ALIASES.length * 0.85, `most AI aliases embed AI (${withAi}/${AI_ALIASES.length})`);
}

function testSessionHumanSticky() {
  resetAliasCursorsForTests();
  const first = nextVsAiNames();
  const second = nextVsAiNames();
  assert(first.a === HUMAN_ALIASES[0], "first human");
  assert(first.b === AI_ALIASES[0], "first ai");
  assert(second.a === first.a, "human sticky within session");
  assert(second.b === AI_ALIASES[1], "ai advances each match");
  assert(sessionHumanAlias() === first.a, "sessionHumanAlias matches");

  // Reload: session sticky clears, bank cursors keep walking.
  clearSessionHumanForTests();
  const afterReload = nextVsAiNames();
  assert(afterReload.a === HUMAN_ALIASES[1], "new human after reload");
  assert(afterReload.b === AI_ALIASES[2], "ai cursor kept across reload");

  const wrapped = namesAt(HUMAN_ALIASES.length, AI_ALIASES.length);
  assert(wrapped.a === HUMAN_ALIASES[0], "human wraps");
  assert(wrapped.b === AI_ALIASES[0], "ai wraps");
}

testBanks();
testSessionHumanSticky();
console.log("playerAliases.selftest: ok");
