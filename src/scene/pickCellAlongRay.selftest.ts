/**
 * ponytail: assert-based self-check for ray cell picking — run with `npm run check:pick`.
 */
import { Vector3 } from "three";
import { cellToWorld } from "@/game/board";
import type { BoardDims } from "@/game/types";
import { pickCellAlongRay } from "./pickCellAlongRay";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testHitsFrontCellAlongRay() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  // Looking down -Z through the column x=1,y=1 — frontmost is z=2.
  const [wx, wy] = cellToWorld({ x: 1, y: 1, z: 2 }, dims);
  const origin = new Vector3(wx, wy, 8);
  const dir = new Vector3(0, 0, -1);
  const hit = pickCellAlongRay({ origin, dir, dims });
  assert(hit !== null, "ray through column should hit");
  assert(hit.x === 1 && hit.y === 1 && hit.z === 2, "should pick frontmost cell");
}

function testMissesBoard() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const origin = new Vector3(20, 20, 20);
  const dir = new Vector3(0, 1, 0);
  const hit = pickCellAlongRay({ origin, dir, dims });
  assert(hit === null, "ray far from board should miss");
}

function testCornerCell() {
  const dims: BoardDims = { x: 3, y: 3, z: 3 };
  const [wx, wy, wz] = cellToWorld({ x: 0, y: 0, z: 0 }, dims);
  const origin = new Vector3(wx - 4, wy - 4, wz - 4);
  const dir = new Vector3(1, 1, 1).normalize();
  const hit = pickCellAlongRay({ origin, dir, dims });
  assert(hit !== null, "corner approach should hit");
  assert(hit.x === 0 && hit.y === 0 && hit.z === 0, "should pick corner cell");
}

testHitsFrontCellAlongRay();
testMissesBoard();
testCornerCell();
console.log("pickCellAlongRay.selftest: ok");
