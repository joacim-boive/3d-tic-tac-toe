import { Vector3 } from "three";
import { cellToWorld } from "@/game/board";
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

function clampIndex(v: number, maxExclusive: number): number {
  return Math.max(0, Math.min(maxExclusive - 1, Math.round(v)));
}

/**
 * Intersect a camera ray with the cell-center plane at `depthIndex` on `axis`,
 * and return the board cell there (axis coord forced to depthIndex).
 *
 * Hits past the board footprint clamp to the nearest in-bounds cell so edge /
 * bottom cells stay reachable when aiming near the screen border.
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

  const ox = ((dims.x - 1) * spacing) / 2;
  const oy = ((dims.y - 1) * spacing) / 2;
  const oz = ((dims.z - 1) * spacing) / 2;

  const x = clampIndex((point.x + ox) / spacing, dims.x);
  const y = clampIndex((point.y + oy) / spacing, dims.y);
  const z = clampIndex((point.z + oz) / spacing, dims.z);

  return {
    x: axis === "x" ? depthIndex : x,
    y: axis === "y" ? depthIndex : y,
    z: axis === "z" ? depthIndex : z,
  };
}
