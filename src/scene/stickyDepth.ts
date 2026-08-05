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

type PointerPoint = { x: number; y: number };

/** Average client Y of active pointers. */
export function pointerCentroidY(points: ReadonlyArray<PointerPoint>): number {
  if (points.length === 0) return 0;
  let sum = 0;
  for (const p of points) sum += p.y;
  return sum / points.length;
}

/**
 * Touch depth enters only when a second (or later) finger lands while already
 * aiming — two fingers from rest stay orbit/pinch.
 */
export function shouldEnterModifierDepth(touchAiming: boolean, pointerCount: number): boolean {
  return touchAiming && pointerCount >= 2;
}

/**
 * Vertical delta for modifier-depth: the finger with the largest |ΔY| from its
 * session start wins. A stationary modifier contributes ~0; the dragging finger
 * drives depth (avoids centroid halving sensitivity).
 */
export function depthDeltaYFromPointers(
  starts: ReadonlyMap<number, PointerPoint>,
  current: ReadonlyMap<number, PointerPoint>,
): number {
  let best = 0;
  for (const [id, pos] of current) {
    const start = starts.get(id);
    if (!start) continue;
    const dy = pos.y - start.y;
    if (Math.abs(dy) > Math.abs(best)) best = dy;
  }
  return best;
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
