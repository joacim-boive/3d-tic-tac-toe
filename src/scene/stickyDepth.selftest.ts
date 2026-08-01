import assert from "node:assert/strict";
import {
  depthStepsFromSwipeDelta,
  pointerCentroidY,
  reconcileStickyDepth,
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

console.log("stickyDepth.selftest: ok");
