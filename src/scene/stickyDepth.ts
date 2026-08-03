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

/** Average client Y of active pointers — used for 3-finger vertical depth. */
export function pointerCentroidY(points: ReadonlyArray<{ x: number; y: number }>): number {
  if (points.length === 0) return 0;
  let sum = 0;
  for (const p of points) sum += p.y;
  return sum / points.length;
}

/**
 * Map a vertical swipe to depth steps.
 * `deltaY` is currentY − startY in client coords (up → negative).
 * Swipe up → deeper; swipe down → shallower.
 */
export function depthStepsFromSwipeDelta(deltaY: number, pxPerStep: number): number {
  if (pxPerStep <= 0) return 0;
  return Math.round(-deltaY / pxPerStep);
}

/**
 * Accumulate wheel deltaY into depth steps (trackpad / mouse).
 * Scroll up (negative deltaY) → positive deeperSteps.
 */
export function applyWheelDeltaToDepthAccum(
  accum: number,
  deltaY: number,
  pxPerStep: number,
): { deeperSteps: number; accum: number } {
  if (pxPerStep <= 0 || deltaY === 0) return { deeperSteps: 0, accum };
  let a = accum + deltaY;
  let deeperSteps = 0;
  while (a <= -pxPerStep) {
    deeperSteps += 1;
    a += pxPerStep;
  }
  while (a >= pxPerStep) {
    deeperSteps -= 1;
    a -= pxPerStep;
  }
  return { deeperSteps, accum: a };
}
