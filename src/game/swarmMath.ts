import type { BoardDims } from "./types";
import { Vector3 } from "three";

/**
 * Map plan UV (0–1 screen space, y down) onto a plane just in front of the board.
 * Sized to the board footprint so flybys stay in the playfield, not the viewport corners.
 */
export function packageWorldPos(
  u: number,
  v: number,
  dims: BoardDims,
  out = new Vector3(),
): Vector3 {
  const span = Math.max(dims.x, dims.y, dims.z);
  const x = (u - 0.5) * span * 1.12;
  const y = (0.5 - v) * span * 0.92;
  const z = span * 0.4;
  return out.set(x, y, z);
}
