/**
 * Assert-based self-check for onboarding prefs — `npm run check:onboarding`.
 */
import {
  ONBOARDING_VERSION,
  hasCompletedOnboarding,
  parseOnboardingPrefs,
} from "./onboardingPrefs";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testParseValid() {
  const prefs = parseOnboardingPrefs({ completedVersion: 1 });
  assert(prefs.completedVersion === 1, "version");
}

function testParseFloor() {
  const prefs = parseOnboardingPrefs({ completedVersion: 2.9 });
  assert(prefs.completedVersion === 2, "floored");
}

function testParseJunk() {
  assert(parseOnboardingPrefs(null).completedVersion === undefined, "null");
  assert(parseOnboardingPrefs("x").completedVersion === undefined, "string");
  assert(parseOnboardingPrefs({ completedVersion: "1" }).completedVersion === undefined, "string ver");
  assert(parseOnboardingPrefs({ completedVersion: NaN }).completedVersion === undefined, "nan");
  assert(parseOnboardingPrefs({ completedVersion: -3 }).completedVersion === 0, "neg → 0");
}

function testCompleted() {
  assert(!hasCompletedOnboarding({}), "empty incomplete");
  assert(!hasCompletedOnboarding({ completedVersion: 0 }), "zero incomplete");
  assert(hasCompletedOnboarding({ completedVersion: ONBOARDING_VERSION }), "current complete");
  assert(hasCompletedOnboarding({ completedVersion: ONBOARDING_VERSION + 5 }), "future complete");
  assert(!hasCompletedOnboarding({ completedVersion: ONBOARDING_VERSION - 1 }), "stale incomplete");
}

testParseValid();
testParseFloor();
testParseJunk();
testCompleted();
console.log("onboardingPrefs.selftest ok");
