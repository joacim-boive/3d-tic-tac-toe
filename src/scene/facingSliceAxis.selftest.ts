import assert from "node:assert/strict";
import { Vector3 } from "three";
import { facingSliceAxis, sliceIndexForCell } from "./facingSliceAxis";

assert.equal(facingSliceAxis(new Vector3(1, 0, 0)), "x");
assert.equal(facingSliceAxis(new Vector3(-0.9, 0.1, 0.2)), "x");
assert.equal(facingSliceAxis(new Vector3(0, 1, 0)), "y");
assert.equal(facingSliceAxis(new Vector3(0.2, -0.8, 0.3)), "y");
assert.equal(facingSliceAxis(new Vector3(0, 0, 1)), "z");
assert.equal(facingSliceAxis(new Vector3(0.3, 0.2, -0.9)), "z");
// Ties break x > y > z by the comparisons above
assert.equal(facingSliceAxis(new Vector3(1, 1, 0)), "x");
assert.equal(facingSliceAxis(new Vector3(0, 1, 1)), "y");

assert.equal(sliceIndexForCell("x", { x: 2, y: 1, z: 0 }), 2);
assert.equal(sliceIndexForCell("y", { x: 2, y: 1, z: 0 }), 1);
assert.equal(sliceIndexForCell("z", { x: 2, y: 1, z: 0 }), 0);

console.log("facingSliceAxis.selftest: ok");
