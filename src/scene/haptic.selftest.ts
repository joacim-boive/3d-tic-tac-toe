import assert from "node:assert/strict";
import {
  canVibrate,
  DEPTH_STEP_MS,
  hapticDepthStep,
  isAppleTouchDevice,
  needsSwitchHaptic,
  releaseDepthHapticSwitches,
} from "./haptic";

assert.equal(canVibrate(undefined), false);
assert.equal(canVibrate({}), false);
assert.equal(canVibrate({ vibrate: () => true }), true);

assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" }), true);
assert.equal(
  isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux" }),
  false,
);
assert.equal(
  isAppleTouchDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    platform: "MacIntel",
    maxTouchPoints: 5,
  }),
  true,
);

assert.equal(needsSwitchHaptic({ userAgent: "Mozilla/5.0 (iPhone)" }), true);
assert.equal(
  needsSwitchHaptic({ userAgent: "Mozilla/5.0 (Linux; Android 14)", vibrate: () => true }),
  false,
);
assert.equal(needsSwitchHaptic({ userAgent: "Mozilla/5.0 (Linux; Android 14)" }), true);

let calledWith: number | number[] | null = null;
hapticDepthStep({
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  vibrate: (pattern) => {
    calledWith = pattern;
    return true;
  },
});
assert.equal(calledWith, DEPTH_STEP_MS, "Android depth step uses a short pulse");

// iOS without armed switches is a silent no-op (no throw).
hapticDepthStep({ userAgent: "Mozilla/5.0 (iPhone)" });
releaseDepthHapticSwitches();

hapticDepthStep(undefined);
hapticDepthStep({
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  vibrate: () => {
    throw new Error("blocked");
  },
});

console.log("haptic.selftest: ok");
