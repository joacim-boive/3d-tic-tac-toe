import assert from "node:assert/strict";
import { Vector3 } from "three";
import { facingOuterSlice } from "./facingSliceAxis";

const dims = { x: 4, y: 4, z: 4 };

assert.deepEqual(facingOuterSlice(new Vector3(5, 1, 2), dims), { axis: "x", index: 3 });
assert.deepEqual(facingOuterSlice(new Vector3(-5, 1, 2), dims), { axis: "x", index: 0 });
assert.deepEqual(facingOuterSlice(new Vector3(1, 6, 2), dims), { axis: "y", index: 3 });
assert.deepEqual(facingOuterSlice(new Vector3(1, -6, 2), dims), { axis: "y", index: 0 });
assert.deepEqual(facingOuterSlice(new Vector3(1, 2, 7), dims), { axis: "z", index: 3 });
assert.deepEqual(facingOuterSlice(new Vector3(1, 2, -7), dims), { axis: "z", index: 0 });
// Ties break x > y > z
assert.deepEqual(facingOuterSlice(new Vector3(5, 5, 1), dims), { axis: "x", index: 3 });
assert.deepEqual(facingOuterSlice(new Vector3(1, 5, 5), dims), { axis: "y", index: 3 });

console.log("facingSliceAxis.selftest: ok");
