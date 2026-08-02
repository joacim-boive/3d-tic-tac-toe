import type { BoardDims } from "./types";
import { Vector3 } from "three";

/**
 * Map plan UV (0–1 overlay space, y down) onto a plane in front of the board.
 * Sized wider than the board so flybys cross the viewport from the screen edges.
 */
export function packageWorldPos(
  u: number,
  v: number,
  dims: BoardDims,
  out = new Vector3(),
): Vector3 {
  const span = Math.max(dims.x, dims.y, dims.z);
  const x = (u - 0.5) * span * 2.35;
  const y = (0.5 - v) * span * 1.65;
  const z = span * 0.52;
  return out.set(x, y, z);
}
