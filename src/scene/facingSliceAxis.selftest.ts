import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  deepDirection,
  facingAxis,
  nearDepthIndex,
  sliceThroughCursor,
} from "./facingSliceAxis";

const dims = { x: 4, y: 4, z: 4 };

assert.equal(facingAxis(new Vector3(5, 1, 2)), "x");
assert.equal(facingAxis(new Vector3(1, 6, 2)), "y");
assert.equal(facingAxis(new Vector3(1, 2, 7)), "z");
assert.equal(facingAxis(new Vector3(5, 9, 2), "drop"), "x");
assert.equal(facingAxis(new Vector3(1, 9, 7), "drop"), "z");

assert.equal(nearDepthIndex(new Vector3(5, 0, 0), "x", dims), 3);
assert.equal(nearDepthIndex(new Vector3(-5, 0, 0), "x", dims), 0);
assert.equal(deepDirection(new Vector3(5, 0, 0), "x"), -1);
assert.equal(deepDirection(new Vector3(-5, 0, 0), "x"), 1);

assert.deepEqual(sliceThroughCursor(new Vector3(5, 1, 2), { x: 1, y: 2, z: 3 }, dims), {
  axis: "x",
  index: 1,
});
assert.deepEqual(
  sliceThroughCursor(new Vector3(1, 9, 7), { x: 1, y: 2, z: 3 }, dims, "drop"),
  { axis: "z", index: 3 },
);

console.log("facingSliceAxis.selftest: ok");
