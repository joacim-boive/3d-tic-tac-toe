/**
 * Assert-based self-check for setup prefs parsing — `npm run check:prefs`.
 */
import { parseSetupPrefs } from "./setupPrefs";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testValidBlob() {
  const prefs = parseSetupPrefs({
    presetId: "5x5x4",
    playMode: "ai",
    placement: "drop",
    aiDifficulty: "hard",
    powerUpsEnabled: true,
  });
  assert(prefs.presetId === "5x5x4", "preset");
  assert(prefs.playMode === "ai", "mode");
  assert(prefs.placement === "drop", "placement");
  assert(prefs.aiDifficulty === "hard", "difficulty");
  assert(prefs.powerUpsEnabled === true, "power-ups on");
}

function testExtremeDifficulty() {
  const prefs = parseSetupPrefs({
    presetId: "4x4x4",
    playMode: "ai",
    placement: "free",
    aiDifficulty: "extreme",
  });
  assert(prefs.aiDifficulty === "extreme", "extreme accepted");
}

function testPowerUpsFlag() {
  assert(parseSetupPrefs({ powerUpsEnabled: false }).powerUpsEnabled === false, "off");
  assert(parseSetupPrefs({ powerUpsEnabled: "yes" }).powerUpsEnabled === undefined, "junk");
}

function testLegacyPresetId() {
  const prefs = parseSetupPrefs({ presetId: "4x4x3" });
  assert(prefs.presetId === "4x4x4", "legacy 4x4x3 → 4x4x4");
}

function testIgnoresJunk() {
  const prefs = parseSetupPrefs({
    playMode: "lan",
    placement: "teleport",
    aiDifficulty: "nightmare",
    presetId: 12,
  });
  assert(prefs.playMode === undefined, "bad playMode dropped");
  assert(prefs.placement === undefined, "bad placement dropped");
  assert(prefs.aiDifficulty === undefined, "bad difficulty dropped");
  assert(prefs.presetId === undefined, "non-string preset dropped");
}

function testNullSafe() {
  assert(Object.keys(parseSetupPrefs(null)).length === 0, "null");
  assert(Object.keys(parseSetupPrefs("nope")).length === 0, "string");
}

testValidBlob();
testExtremeDifficulty();
testPowerUpsFlag();
testLegacyPresetId();
testIgnoresJunk();
testNullSafe();
console.log("setupPrefs.selftest: ok");
