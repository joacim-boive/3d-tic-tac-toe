import { Vector3 } from "three";
import { cellToWorld, worldToCell } from "@/game/board";
import type { BoardDims, CellCoord } from "@/game/types";

type PickCellAlongRayArgs = {
  origin: Vector3;
  dir: Vector3;
  dims: BoardDims;
  spacing?: number;
  /** Scratch vectors — reused by callers that run this every frame. */
  point?: Vector3;
  center?: Vector3;
};

/**
 * Walk a camera ray through the board AABB and return the cell whose center
 * is closest to the ray (within half a cell). Null if the ray misses.
 */
export function pickCellAlongRay({
  origin,
  dir,
  dims,
  spacing = 1,
  point = new Vector3(),
  center = new Vector3(),
}: PickCellAlongRayArgs): CellCoord | null {
  const halfX = (dims.x * spacing) / 2 + 0.01;
  const halfY = (dims.y * spacing) / 2 + 0.01;
  const halfZ = (dims.z * spacing) / 2 + 0.01;
  const maxHalf = Math.max(halfX, halfY, halfZ);

  let best: CellCoord | null = null;
  let bestDist = spacing * 0.65;
  const maxT = maxHalf * 5;
  const step = spacing * 0.25;

  for (let t = 0; t <= maxT; t += step) {
    point.copy(origin).addScaledVector(dir, t);
    if (Math.abs(point.x) > halfX || Math.abs(point.y) > halfY || Math.abs(point.z) > halfZ) {
      continue;
    }
    const cell = worldToCell(point.x, point.y, point.z, dims, spacing);
    if (!cell) continue;
    const [wx, wy, wz] = cellToWorld(cell, dims, spacing);
    center.set(wx, wy, wz);
    const d = point.distanceTo(center);
    if (d < bestDist) {
      bestDist = d;
      best = cell;
    }
  }

  return best;
}
