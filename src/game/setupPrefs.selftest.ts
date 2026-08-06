/**
 * Assert-based self-check for setup prefs parsing — `npm run check:prefs`.
 */
import {
  applySetupPrefsToUrl,
  parseSetupPrefs,
  parseSetupPrefsFromSearchParams,
  searchParamsHaveSetupPrefs,
  setupPrefsToSearchParams,
  type SetupPrefs,
} from "./setupPrefs";

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

  const impossible = parseSetupPrefs({
    presetId: "4x4x4",
    playMode: "ai",
    placement: "free",
    aiDifficulty: "impossible",
  });
  assert(impossible.aiDifficulty === "impossible", "impossible accepted");
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

const SAMPLE: SetupPrefs = {
  presetId: "5x5x4",
  playMode: "ai",
  placement: "drop",
  aiDifficulty: "hard",
  powerUpsEnabled: true,
};

function testUrlRoundTrip() {
  const params = setupPrefsToSearchParams(SAMPLE);
  assert(params.get("mode") === "ai", "mode key");
  assert(params.get("placement") === "drop", "placement key");
  assert(params.get("preset") === "5x5x4", "preset key");
  assert(params.get("difficulty") === "hard", "difficulty key");
  assert(params.get("powerUps") === "on", "powerUps on");

  const parsed = parseSetupPrefsFromSearchParams(params);
  assert(parsed.playMode === SAMPLE.playMode, "round-trip mode");
  assert(parsed.placement === SAMPLE.placement, "round-trip placement");
  assert(parsed.presetId === SAMPLE.presetId, "round-trip preset");
  assert(parsed.aiDifficulty === SAMPLE.aiDifficulty, "round-trip difficulty");
  assert(parsed.powerUpsEnabled === SAMPLE.powerUpsEnabled, "round-trip powerUps");
}

function testUrlPowerUpsAliases() {
  for (const [raw, expected] of [
    ["on", true],
    ["off", false],
    ["1", true],
    ["0", false],
    ["true", true],
    ["false", false],
  ] as const) {
    const params = new URLSearchParams({ powerUps: raw });
    assert(
      parseSetupPrefsFromSearchParams(params).powerUpsEnabled === expected,
      `powerUps=${raw}`,
    );
  }
  assert(
    parseSetupPrefsFromSearchParams(new URLSearchParams({ powerUps: "maybe" })).powerUpsEnabled ===
      undefined,
    "junk powerUps dropped",
  );
}

function testUrlFieldAliases() {
  const params = new URLSearchParams({
    playMode: "online",
    presetId: "3x3x3",
    aiDifficulty: "easy",
    powerUpsEnabled: "off",
    placement: "free",
  });
  const prefs = parseSetupPrefsFromSearchParams(params);
  assert(prefs.playMode === "online", "playMode alias");
  assert(prefs.presetId === "3x3x3", "presetId alias");
  assert(prefs.aiDifficulty === "easy", "aiDifficulty alias");
  assert(prefs.powerUpsEnabled === false, "powerUpsEnabled alias");
}

function testUrlLegacyPreset() {
  const prefs = parseSetupPrefsFromSearchParams(new URLSearchParams({ preset: "4x4x3" }));
  assert(prefs.presetId === "4x4x4", "legacy preset in URL");
}

function testSearchParamsHaveSetupPrefs() {
  assert(searchParamsHaveSetupPrefs(new URLSearchParams({ mode: "ai" })), "mode present");
  assert(searchParamsHaveSetupPrefs(new URLSearchParams({ preset: "3x3x3" })), "preset present");
  assert(!searchParamsHaveSetupPrefs(new URLSearchParams({ _app: "x" })), "unrelated only");
  assert(!searchParamsHaveSetupPrefs(new URLSearchParams()), "empty");
}

function testApplySetupPrefsToUrlPreservesOtherParams() {
  const url = new URL("https://example.com/?_app=build1&mode=hotseat&foo=bar");
  const next = applySetupPrefsToUrl(url, SAMPLE);
  assert(next.searchParams.get("_app") === "build1", "keeps _app");
  assert(next.searchParams.get("foo") === "bar", "keeps unrelated");
  assert(next.searchParams.get("mode") === "ai", "updates mode");
  assert(next.searchParams.get("powerUps") === "on", "sets powerUps");
  assert(next.searchParams.get("playMode") === null, "drops playMode alias");
}

testValidBlob();
testExtremeDifficulty();
testPowerUpsFlag();
testLegacyPresetId();
testIgnoresJunk();
testNullSafe();
testUrlRoundTrip();
testUrlPowerUpsAliases();
testUrlFieldAliases();
testUrlLegacyPreset();
testSearchParamsHaveSetupPrefs();
testApplySetupPrefsToUrlPreservesOtherParams();
console.log("setupPrefs.selftest: ok");
