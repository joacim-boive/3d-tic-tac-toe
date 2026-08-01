import { Vector3 } from "three";

export type SliceAxis = "x" | "y" | "z";

export type SliceHighlight = {
  axis: SliceAxis;
  /** Cell index along the axis (0 … dims[axis]−1). */
  index: number;
};

/**
 * Pick the board axis whose face is most toward the camera (largest |view·axis|).
 * That plane is seen face-on instead of edge-on.
 */
export function facingSliceAxis(viewDir: Vector3): SliceAxis {
  const ax = Math.abs(viewDir.x);
  const ay = Math.abs(viewDir.y);
  const az = Math.abs(viewDir.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= az) return "y";
  return "z";
}

export function sliceIndexForCell(
  axis: SliceAxis,
  cell: { x: number; y: number; z: number },
): number {
  return cell[axis];
}
