import assert from "node:assert/strict";
import {
  applyWheelDeltaToDepthAccum,
  depthDeltaYFromPointers,
  depthStepsFromSwipeDelta,
  pointerCentroidY,
  reconcileStickyDepth,
  shouldEnterModifierDepth,
  stepStickyDepth,
} from "./stickyDepth";

const dims = { x: 4, y: 4, z: 4 };

assert.deepEqual(
  reconcileStickyDepth(null, { x: 5, y: 1, z: 2 }, dims, "free"),
  { axis: "x", index: 3 },
);
assert.deepEqual(
  reconcileStickyDepth({ axis: "x", index: 1 }, { x: 5, y: 1, z: 2 }, dims, "free"),
  { axis: "x", index: 1 },
);
assert.deepEqual(
  reconcileStickyDepth({ axis: "z", index: 2 }, { x: 5, y: 1, z: 2 }, dims, "free"),
  { axis: "x", index: 3 },
);

assert.deepEqual(
  stepStickyDepth({ axis: "z", index: 3 }, { x: 0, y: 0, z: 5 }, dims, 1),
  { axis: "z", index: 2 },
);
assert.deepEqual(
  stepStickyDepth({ axis: "z", index: 2 }, { x: 0, y: 0, z: 5 }, dims, -1),
  { axis: "z", index: 3 },
);

assert.equal(pointerCentroidY([
  { x: 0, y: 10 },
  { x: 10, y: 20 },
  { x: 20, y: 30 },
]), 20);
// Swipe up (deltaY negative) → deeper
assert.equal(depthStepsFromSwipeDelta(-50, 50), 1);
assert.equal(depthStepsFromSwipeDelta(50, 50), -1);
assert.equal(depthStepsFromSwipeDelta(-20, 50), 0);

// Wheel accum: scroll up (neg) → deeper; need full pxPerStep before a step.
assert.deepEqual(applyWheelDeltaToDepthAccum(0, -20, 48), { deeperSteps: 0, accum: -20 });
assert.deepEqual(applyWheelDeltaToDepthAccum(-20, -30, 48), { deeperSteps: 1, accum: -2 });
assert.deepEqual(applyWheelDeltaToDepthAccum(0, 48, 48), { deeperSteps: -1, accum: 0 });
assert.deepEqual(applyWheelDeltaToDepthAccum(0, -96, 48), { deeperSteps: 2, accum: 0 });
assert.deepEqual(applyWheelDeltaToDepthAccum(0, 0, 48), { deeperSteps: 0, accum: 0 });

assert.equal(shouldEnterModifierDepth(true, 2), true);
assert.equal(shouldEnterModifierDepth(true, 3), true);
assert.equal(shouldEnterModifierDepth(false, 2), false);
assert.equal(shouldEnterModifierDepth(true, 1), false);

{
  const starts = new Map([
    [1, { x: 10, y: 100 }],
    [2, { x: 40, y: 100 }],
  ]);
  // Stationary modifier + drag up → negative delta from moving finger only.
  const current = new Map([
    [1, { x: 10, y: 100 }],
    [2, { x: 40, y: 52 }],
  ]);
  assert.equal(depthDeltaYFromPointers(starts, current), -48);
  // Larger |ΔY| wins when both move.
  const both = new Map([
    [1, { x: 10, y: 90 }],
    [2, { x: 40, y: 40 }],
  ]);
  assert.equal(depthDeltaYFromPointers(starts, both), -60);
}

console.log("stickyDepth.selftest: ok");
