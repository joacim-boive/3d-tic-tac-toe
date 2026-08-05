/**
 * Assert-based check for swarm package world mapping — run with `npm run check:swarm`.
 */
import {
  createEmptySwarmFlyFrame,
  packageWorldPos,
  swarmFlyFrameFromCamera,
} from "./swarmMath";
import type { BoardDims } from "./types";
import { PerspectiveCamera, Vector3 } from "three";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testCenterMapsToOrigin() {
  const frame = createEmptySwarmFlyFrame();
  frame.origin.set(1, 2, 3);
  frame.halfW = 4;
  frame.halfH = 3;
  const p = packageWorldPos(0.5, 0.5, frame);
  assert(Math.abs(p.x - 1) < 1e-6, "center u → origin.x");
  assert(Math.abs(p.y - 2) < 1e-6, "center v → origin.y");
  assert(Math.abs(p.z - 3) < 1e-6, "center → origin.z");
}

function testCornersSpanViewport() {
  const frame = createEmptySwarmFlyFrame();
  frame.origin.set(0, 0, 0);
  frame.halfW = 5;
  frame.halfH = 3;
  const a = packageWorldPos(0, 0, frame);
  const b = packageWorldPos(1, 1, frame);
  assert(a.x < 0 && a.y > 0, "top-left of UV → −x +y");
  assert(b.x > 0 && b.y < 0, "bottom-right → +x −y");
  assert(Math.abs(a.x + 5) < 1e-6 && Math.abs(a.y - 3) < 1e-6, "u=0,v=0 at −halfW,+halfH");
  assert(Math.abs(b.x - 5) < 1e-6 && Math.abs(b.y + 3) < 1e-6, "u=1,v=1 at +halfW,−halfH");
  assert(a.distanceTo(b) > 8, "corners span the viewport plane");
}

/** Closer camera → smaller fly plane so packages stay inside the tighter frustum. */
function testZoomShrinksFlyPlane() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const far = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  far.position.set(8, 6, 9);
  far.lookAt(0, 0, 0);
  far.updateMatrixWorld();

  const near = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  near.position.set(3.2, 2.4, 3.6);
  near.lookAt(0, 0, 0);
  near.updateMatrixWorld();

  const farFrame = createEmptySwarmFlyFrame();
  const nearFrame = createEmptySwarmFlyFrame();
  swarmFlyFrameFromCamera(far, dims, farFrame);
  swarmFlyFrameFromCamera(near, dims, nearFrame);

  assert(nearFrame.halfW < farFrame.halfW, "zoomed-in halfW smaller");
  assert(nearFrame.halfH < farFrame.halfH, "zoomed-in halfH smaller");

  const farCorner = packageWorldPos(0, 0, farFrame);
  const nearCorner = packageWorldPos(0, 0, nearFrame);
  // Project to NDC — both should sit near the same screen edge regardless of dolly.
  farCorner.project(far);
  nearCorner.project(near);
  assert(Math.abs(farCorner.x - nearCorner.x) < 0.05, "UV edge stays at same NDC x across zoom");
  assert(Math.abs(farCorner.y - nearCorner.y) < 0.05, "UV edge stays at same NDC y across zoom");
  assert(Math.abs(Math.abs(farCorner.x) - 1) < 0.05, "UV 0 maps near left NDC edge");
}

function testFrameFacesCamera() {
  const dims: BoardDims = { x: 4, y: 4, z: 4 };
  const camera = new PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const frame = createEmptySwarmFlyFrame();
  swarmFlyFrameFromCamera(camera, dims, frame);
  assert(frame.origin.z > 0, "plane sits in front of board toward camera");
  assert(frame.right.dot(new Vector3(1, 0, 0)) > 0.99, "right aligns with world +X");
  assert(frame.up.dot(new Vector3(0, 1, 0)) > 0.99, "up aligns with world +Y");
  assert(frame.halfW > 0 && frame.halfH > 0, "positive extents");
}

testCenterMapsToOrigin();
testCornersSpanViewport();
testZoomShrinksFlyPlane();
testFrameFacesCamera();
console.log("swarmPackages.selftest: ok");
