import { Vector3 } from "three";
import type { BoardDims } from "@/game/types";

export type SliceAxis = "x" | "y" | "z";

export type SliceHighlight = {
  axis: SliceAxis;
  /** Cell index along the axis (0 … dims[axis]−1). */
  index: number;
};

type CamPos = Pick<Vector3, "x" | "y" | "z">;

/**
 * Board axis most aligned with the camera (face-on plane normal).
 * Drop mode ignores Y — depth is horizontal; gravity owns vertical.
 */
export function facingAxis(camPos: CamPos, placement: "free" | "drop" = "free"): SliceAxis {
  const ax = Math.abs(camPos.x);
  const ay = Math.abs(camPos.y);
  const az = Math.abs(camPos.z);

  if (placement === "drop") {
    return ax >= az ? "x" : "z";
  }
  if (ax >= ay && ax >= az) return "x";
  if (ay >= az) return "y";
  return "z";
}

/** Cell index on `axis` closest to the camera (front of the board). */
export function nearDepthIndex(camPos: CamPos, axis: SliceAxis, dims: BoardDims): number {
  const extent = dims[axis];
  return camPos[axis] >= 0 ? extent - 1 : 0;
}

/**
 * Index step that moves away from the camera (deeper into the board).
 * +1 or −1.
 */
export function deepDirection(camPos: CamPos, axis: SliceAxis): 1 | -1 {
  return camPos[axis] >= 0 ? -1 : 1;
}

/** Face-on slice through the aimed cell’s depth on the camera-facing axis. */
export function sliceThroughCursor(
  camPos: CamPos,
  cursor: { x: number; y: number; z: number },
  dims: BoardDims,
  placement: "free" | "drop" = "free",
): SliceHighlight {
  const axis = facingAxis(camPos, placement);
  return { axis, index: cursor[axis] };
}

/** @deprecated outer-face helper — prefer sliceThroughCursor for aim depth. */
export function facingOuterSlice(camPos: Vector3, dims: BoardDims): SliceHighlight {
  const axis = facingAxis(camPos, "free");
  return { axis, index: nearDepthIndex(camPos, axis, dims) };
}
