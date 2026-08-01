import assert from "node:assert/strict";
import {
  depthStepsFromSpreadDelta,
  pointerSpread,
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

assert.ok(pointerSpread([
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
]) > 0);
assert.equal(depthStepsFromSpreadDelta(-50, 50), 1);
assert.equal(depthStepsFromSpreadDelta(50, 50), -1);
assert.equal(depthStepsFromSpreadDelta(-20, 50), 0);

console.log("stickyDepth.selftest: ok");
