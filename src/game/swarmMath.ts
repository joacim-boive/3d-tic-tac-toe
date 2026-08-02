import type { BoardDims } from "./types";
import { Vector3 } from "three";

/**
 * Map plan UV (0–1 screen space, y down) onto a plane in front of the board.
 * Shared by the 3D swarm scene and self-tests.
 */
export function packageWorldPos(
  u: number,
  v: number,
  dims: BoardDims,
  out = new Vector3(),
): Vector3 {
  const span = Math.max(dims.x, dims.y, dims.z) * 1.35;
  const x = (u - 0.5) * span * 1.85;
  const y = (0.5 - v) * span * 1.25;
  const z = span * 0.62;
  return out.set(x, y, z);
}
