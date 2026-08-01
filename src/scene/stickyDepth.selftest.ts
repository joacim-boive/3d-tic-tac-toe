import assert from "node:assert/strict";
import {
  classifyAimGesture,
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

assert.equal(classifyAimGesture("pending", 5, 40, 28, 1.25), "depth");
assert.equal(classifyAimGesture("pending", 40, 5, 28, 1.25), "lateral");
assert.equal(classifyAimGesture("pending", 10, 10, 28, 1.25), "pending");
assert.equal(classifyAimGesture("pending", 30, 30, 28, 1.25), "lateral");
assert.equal(classifyAimGesture("depth", 40, 5, 28, 1.25), "depth");

console.log("stickyDepth.selftest: ok");
