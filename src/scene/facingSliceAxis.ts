import { Vector3 } from "three";
import type { BoardDims } from "@/game/types";

export type SliceAxis = "x" | "y" | "z";

export type SliceHighlight = {
  axis: SliceAxis;
  /** Cell index along the axis (0 … dims[axis]−1). */
  index: number;
};

/**
 * Outer board face most toward the camera (largest |cam| axis, near side).
 * Chosen when aiming starts so the front side is highlighted before place/drop.
 */
export function facingOuterSlice(camPos: Vector3, dims: BoardDims): SliceHighlight {
  const ax = Math.abs(camPos.x);
  const ay = Math.abs(camPos.y);
  const az = Math.abs(camPos.z);

  if (ax >= ay && ax >= az) {
    return { axis: "x", index: camPos.x >= 0 ? dims.x - 1 : 0 };
  }
  if (ay >= az) {
    return { axis: "y", index: camPos.y >= 0 ? dims.y - 1 : 0 };
  }
  return { axis: "z", index: camPos.z >= 0 ? dims.z - 1 : 0 };
}
