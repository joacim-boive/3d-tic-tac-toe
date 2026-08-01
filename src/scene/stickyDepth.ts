import type { BoardDims } from "@/game/types";
import {
  deepDirection,
  facingAxis,
  nearDepthIndex,
  type SliceAxis,
  type SliceHighlight,
} from "./facingSliceAxis";

type CamPos = { x: number; y: number; z: number };
type Placement = "free" | "drop";

/**
 * Keep sticky depth when the facing axis is unchanged; otherwise snap to the
 * near layer on the new axis (orbit changed which face is front).
 */
export function reconcileStickyDepth(
  sticky: SliceHighlight | null,
  camPos: CamPos,
  dims: BoardDims,
  placement: Placement,
): SliceHighlight {
  const axis = facingAxis(camPos, placement);
  if (sticky && sticky.axis === axis) {
    const max = dims[axis] - 1;
    return { axis, index: Math.max(0, Math.min(max, sticky.index)) };
  }
  return { axis, index: nearDepthIndex(camPos, axis, dims) };
}

export function clampDepthIndex(index: number, axis: SliceAxis, dims: BoardDims): number {
  return Math.max(0, Math.min(dims[axis] - 1, index));
}

/** Step sticky depth toward/away from camera. delta +1 = one layer deeper. */
export function stepStickyDepth(
  sticky: SliceHighlight,
  camPos: CamPos,
  dims: BoardDims,
  deeperDelta: 1 | -1,
): SliceHighlight {
  const dir = deepDirection(camPos, sticky.axis);
  return {
    axis: sticky.axis,
    index: clampDepthIndex(sticky.index + deeperDelta * dir, sticky.axis, dims),
  };
}

export type AimGesture = "pending" | "lateral" | "depth";

/**
 * Lock a drag to lateral or depth once movement is clearly dominant.
 * `upPositive` should be larger when the pointer moves up on screen.
 */
export function classifyAimGesture(
  current: AimGesture,
  dx: number,
  upPositive: number,
  lockPx: number,
  dominance: number,
): AimGesture {
  if (current !== "pending") return current;
  const ax = Math.abs(dx);
  const ay = Math.abs(upPositive);
  if (ax < lockPx && ay < lockPx) return "pending";
  if (ay > ax * dominance) return "depth";
  if (ax >= ay * dominance) return "lateral";
  // Ambiguous diagonal — prefer lateral so depth stays sticky.
  return "lateral";
}
