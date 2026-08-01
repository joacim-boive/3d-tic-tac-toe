import { Vector3 } from "three";
import { cellToWorld, worldToCell } from "@/game/board";
import type { BoardDims, CellCoord } from "@/game/types";
import type { SliceAxis } from "./facingSliceAxis";

type PickOnDepthPlaneArgs = {
  origin: Vector3;
  dir: Vector3;
  dims: BoardDims;
  axis: SliceAxis;
  depthIndex: number;
  spacing?: number;
  point?: Vector3;
};

/**
 * Intersect a camera ray with the cell-center plane at `depthIndex` on `axis`,
 * and return the board cell there (axis coord forced to depthIndex).
 */
export function pickCellOnDepthPlane({
  origin,
  dir,
  dims,
  axis,
  depthIndex,
  spacing = 1,
  point = new Vector3(),
}: PickOnDepthPlaneArgs): CellCoord | null {
  const maxIndex = dims[axis] - 1;
  if (depthIndex < 0 || depthIndex > maxIndex) return null;

  const depthCoord =
    axis === "x"
      ? { x: depthIndex, y: 0, z: 0 }
      : axis === "y"
        ? { x: 0, y: depthIndex, z: 0 }
        : { x: 0, y: 0, z: depthIndex };
  const [wx, wy, wz] = cellToWorld(depthCoord, dims, spacing);
  const planePos = axis === "x" ? wx : axis === "y" ? wy : wz;
  const dirComp = axis === "x" ? dir.x : axis === "y" ? dir.y : dir.z;
  const originComp = axis === "x" ? origin.x : axis === "y" ? origin.y : origin.z;

  if (Math.abs(dirComp) < 1e-8) return null;
  const t = (planePos - originComp) / dirComp;
  if (t < 0) return null;

  point.copy(origin).addScaledVector(dir, t);

  const hx = (dims.x * spacing) / 2;
  const hy = (dims.y * spacing) / 2;
  const hz = (dims.z * spacing) / 2;
  const pad = spacing * 0.49;
  // Keep the hit on the face even if the ray glances past the edge.
  point.x = Math.max(-hx + pad, Math.min(hx - pad, point.x));
  point.y = Math.max(-hy + pad, Math.min(hy - pad, point.y));
  point.z = Math.max(-hz + pad, Math.min(hz - pad, point.z));

  const cell = worldToCell(point.x, point.y, point.z, dims, spacing);
  if (!cell) return null;

  return {
    x: axis === "x" ? depthIndex : cell.x,
    y: axis === "y" ? depthIndex : cell.y,
    z: axis === "z" ? depthIndex : cell.z,
  };
}
