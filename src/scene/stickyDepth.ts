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

/** Mean distance of points from their centroid — used for 3-finger pinch depth. */
export function pointerSpread(points: ReadonlyArray<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  let sum = 0;
  for (const p of points) {
    sum += Math.hypot(p.x - cx, p.y - cy);
  }
  return sum / points.length;
}

/**
 * Map a change in finger spread to depth steps.
 * Pinch in (negative delta) → deeper; spread out → shallower.
 */
export function depthStepsFromSpreadDelta(deltaSpread: number, pxPerStep: number): number {
  if (pxPerStep <= 0) return 0;
  // Negative deltaSpread (pinch) → positive deeper steps.
  return Math.round(-deltaSpread / pxPerStep);
}
