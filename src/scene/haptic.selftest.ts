import assert from "node:assert/strict";
import { canVibrate, hapticDepthStep } from "./haptic";

assert.equal(canVibrate(undefined), false);
assert.equal(canVibrate({}), false);
assert.equal(canVibrate({ vibrate: () => true }), true);

let calledWith: number | number[] | null = null;
hapticDepthStep({
  vibrate: (pattern) => {
    calledWith = pattern;
    return true;
  },
});
assert.equal(calledWith, 14, "depth step uses a short pulse");

// No throw when vibrate is absent or throws.
hapticDepthStep(undefined);
hapticDepthStep({
  vibrate: () => {
    throw new Error("blocked");
  },
});

console.log("haptic.selftest: ok");
