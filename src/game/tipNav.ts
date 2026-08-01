import { Euler, Quaternion, Vector3 } from "three";
import {
  TIP_DOWNS,
  eulerForTipDown,
  snapTipEuler,
  tipDownFromEuler,
  type TipEuler,
} from "./tipBoard";

const HALF_PI = Math.PI / 2;

export function eulerToQuat(e: TipEuler): Quaternion {
  return new Quaternion().setFromEuler(new Euler(e.x, e.y, e.z, "XYZ"));
}

/** All 24 cube orientations: 6 floors × 4 spins about world up. */
function buildCubeOrients(): Quaternion[] {
  const out: Quaternion[] = [];
  for (const down of TIP_DOWNS) {
    const base = eulerToQuat(eulerForTipDown(down));
    for (let i = 0; i < 4; i++) {
      const spin = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * HALF_PI);
      out.push(spin.clone().multiply(base));
    }
  }
  return out;
}

const CUBE_ORIENTS = buildCubeOrients();

/** Snap any orientation to the nearest cardinal cube pose. */
export function snapQuatToTipEuler(q: Quaternion): TipEuler {
  let best = CUBE_ORIENTS[0]!;
  let bestScore = -1;
  for (const o of CUBE_ORIENTS) {
    const score = Math.abs(q.dot(o));
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  const e = new Euler().setFromQuaternion(best, "XYZ");
  return snapTipEuler({ x: e.x, y: e.y, z: e.z });
}

/**
 * Tip gestures relative to world gravity (floor = face toward world −Y):
 * - Horizontal: spin ±90° about world up — same floor, new forward
 * - Vertical: flip ±90° about camera-right — new floor
 *
 * Always rotate in world space then snap. Do not bump Euler Y alone (breaks once tipped).
 */
export function tipEulerFromSwipe(
  current: TipEuler,
  camRight: Vector3,
  dx: number,
  dy: number,
): TipEuler {
  const snapped = snapTipEuler(current);
  const q = eulerToQuat(snapped);

  if (Math.abs(dx) > Math.abs(dy)) {
    const angle = (dx > 0 ? 1 : -1) * HALF_PI;
    const delta = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
    return snapQuatToTipEuler(delta.multiply(q));
  }

  const axis = camRight.clone();
  axis.y = 0;
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  else axis.normalize();

  // Screen y grows downward; swipe up (dy < 0) → bottom toward camera.
  const angle = (dy < 0 ? -1 : 1) * HALF_PI;
  const curDown = tipDownFromEuler(snapped);

  const applyFlip = (a: number): TipEuler => {
    const delta = new Quaternion().setFromAxisAngle(axis, a);
    return snapQuatToTipEuler(delta.multiply(q.clone()));
  };

  let next = applyFlip(angle);
  if (tipDownFromEuler(next) === curDown) {
    next = applyFlip(-angle);
  }
  return next;
}
