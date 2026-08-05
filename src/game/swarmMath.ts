import type { BoardDims } from "./types";
import { Vector3, type Camera, type PerspectiveCamera } from "three";

/** Camera-facing plane that maps plan UV (0–1) onto the live viewport. */
export type SwarmFlyFrame = {
  origin: Vector3;
  right: Vector3;
  up: Vector3;
  halfW: number;
  halfH: number;
};

export function createEmptySwarmFlyFrame(): SwarmFlyFrame {
  return {
    origin: new Vector3(),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    halfW: 1,
    halfH: 1,
  };
}

/**
 * Map plan UV (0–1 overlay space, y down) onto the current fly frame.
 * UV edges sit at the viewport edges so flybys cross the screen at any zoom.
 */
export function packageWorldPos(
  u: number,
  v: number,
  frame: SwarmFlyFrame,
  out = new Vector3(),
): Vector3 {
  const x = (u - 0.5) * 2 * frame.halfW;
  const y = (0.5 - v) * 2 * frame.halfH;
  return out.copy(frame.origin).addScaledVector(frame.right, x).addScaledVector(frame.up, y);
}

function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

const _towardCam = new Vector3();
const _target = new Vector3(0, 0, 0);

/**
 * Build a camera-facing fly plane just in front of the board.
 * Half-extents match the perspective frustum at that depth, so zoom (dolly)
 * always keeps packages inside the player's viewport.
 */
export function swarmFlyFrameFromCamera(
  camera: Camera,
  dims: BoardDims,
  out: SwarmFlyFrame,
  target: Vector3 = _target,
): SwarmFlyFrame {
  camera.updateMatrixWorld();
  out.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  out.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  const span = Math.max(dims.x, dims.y, dims.z);
  const camDist = camera.position.distanceTo(target);
  // Sit ahead of the board bulk, toward the camera — never behind the lens.
  const frontLift = Math.min(span * 0.45, camDist * 0.55);
  _towardCam.copy(camera.position).sub(target);
  if (_towardCam.lengthSq() < 1e-8) {
    _towardCam.set(0, 0, 1);
  } else {
    _towardCam.normalize();
  }
  out.origin.copy(target).addScaledVector(_towardCam, frontLift);

  const planeDist = Math.max(0.35, camera.position.distanceTo(out.origin));
  if (isPerspectiveCamera(camera)) {
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * planeDist;
    out.halfH = halfH;
    out.halfW = halfH * Math.max(0.2, camera.aspect);
  } else {
    // Orthographic fallback — rare in this app; keep a board-sized plane.
    out.halfW = span * 0.9;
    out.halfH = span * 0.65;
  }
  return out;
}
