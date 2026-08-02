/**
 * Assert-based check for swarm package world mapping — run with `npm run check:swarm`.
 */
import { packageWorldPos } from "./swarmMath";
import type { BoardDims } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testCenterMapsNearOrigin() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const p = packageWorldPos(0.5, 0.5, dims);
  assert(Math.abs(p.x) < 1e-6, "center u → x≈0");
  assert(Math.abs(p.y) < 1e-6, "center v → y≈0");
  assert(p.z > 0, "packages sit in front of the board");
}

function testCornersSpread() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const a = packageWorldPos(0, 0, dims);
  const b = packageWorldPos(1, 1, dims);
  assert(a.x < 0 && a.y > 0, "top-left of UV → −x +y");
  assert(b.x > 0 && b.y < 0, "bottom-right → +x −y");
  assert(a.distanceTo(b) > 3, "corners are well separated across the board");
}

testCenterMapsNearOrigin();
testCornersSpread();
console.log("swarmPackages.selftest: ok");
