import assert from "node:assert/strict";
import { Vector3 } from "three";
import { cellToWorld } from "@/game/board";
import type { BoardDims } from "@/game/types";
import { pickCellOnDepthPlane } from "./pickCellOnDepthPlane";

const dims: BoardDims = { x: 4, y: 4, z: 4 };

{
  // Camera on +Z looking at depth z=1 — pick x=2,y=2 on that plane.
  const [wx, wy] = cellToWorld({ x: 2, y: 2, z: 1 }, dims);
  const origin = new Vector3(wx, wy, 10);
  const dir = new Vector3(0, 0, -1);
  const hit = pickCellOnDepthPlane({
    origin,
    dir,
    dims,
    axis: "z",
    depthIndex: 1,
  });
  assert.ok(hit);
  assert.equal(hit.x, 2);
  assert.equal(hit.y, 2);
  assert.equal(hit.z, 1);
}

{
  // Depth on +X face side, looking along -X.
  const [, wy, wz] = cellToWorld({ x: 0, y: 1, z: 2 }, dims);
  const origin = new Vector3(10, wy, wz);
  const dir = new Vector3(-1, 0, 0);
  const hit = pickCellOnDepthPlane({
    origin,
    dir,
    dims,
    axis: "x",
    depthIndex: 0,
  });
  assert.ok(hit);
  assert.equal(hit.x, 0);
  assert.equal(hit.y, 1);
  assert.equal(hit.z, 2);
}

{
  // Ray hits well below the board on the depth plane → clamp to bottom row y=0.
  const origin = new Vector3(0, 0, 10);
  const dir = new Vector3(0, -0.8, -1).normalize();
  const hit = pickCellOnDepthPlane({
    origin,
    dir,
    dims,
    axis: "z",
    depthIndex: 2,
  });
  assert.ok(hit);
  assert.equal(hit.z, 2);
  assert.equal(hit.y, 0);
}

{
  // Ray hits above and past the side → clamp to top + side edge.
  const origin = new Vector3(0, 0, 10);
  const dir = new Vector3(2, 2, -1).normalize();
  const hit = pickCellOnDepthPlane({
    origin,
    dir,
    dims,
    axis: "z",
    depthIndex: 1,
  });
  assert.ok(hit);
  assert.equal(hit.z, 1);
  assert.equal(hit.x, 3);
  assert.equal(hit.y, 3);
}

{
  const origin = new Vector3(0, 0, 10);
  const dir = new Vector3(0, 0, 1); // away from board
  const hit = pickCellOnDepthPlane({
    origin,
    dir,
    dims,
    axis: "z",
    depthIndex: 2,
  });
  assert.equal(hit, null);
}

console.log("pickCellOnDepthPlane.selftest: ok");
