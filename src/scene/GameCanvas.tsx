"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { MathUtils, MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { TipBoardFrame } from "./TipBoardFrame";
import { SwarmPackages } from "./SwarmPackages";

/** Left-drag aims (SelectionCursor); right-drag orbits (mouse fallback). -1 = no action. */
const DESKTOP_MOUSE_BUTTONS = {
  LEFT: -1 as unknown as (typeof MOUSE)["ROTATE"],
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.ROTATE,
};

function camDistance(dims: { x: number; y: number; z: number }): number {
  return Math.max(dims.x, dims.y, dims.z) * 1.6 + 2;
}

/** Kill long-press callouts / text selection on the WebGL surface. */
function BlockNativeGestures() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", block);
    el.addEventListener("selectstart", block);
    el.addEventListener("gesturestart", block);
    return () => {
      el.removeEventListener("contextmenu", block);
      el.removeEventListener("selectstart", block);
      el.removeEventListener("gesturestart", block);
    };
  }, [gl]);

  return null;
}

/**
 * Fine-pointer trackpad: two-finger scroll → orbit (no click).
 * Shift+scroll → depth (SelectionCursor). Pinch (ctrl-wheel) → OrbitControls zoom.
 */
function TrackpadOrbit({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!active || !controls) return;
    const el = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      // Pinch → ctrl-wheel; leave for OrbitControls dolly.
      if (e.ctrlKey) return;
      // Shift+scroll → depth in SelectionCursor.
      if (e.shiftKey) return;
      if (!controls.enabled || !controls.enableRotate) return;
      e.preventDefault();
      e.stopPropagation();

      const h = el.clientHeight || 1;
      const speed = controls.rotateSpeed;
      // Same scale as OrbitControls mouse rotate (both axes use height).
      // Invert vs raw wheel so drag direction matches expected camera motion.
      const dAz = ((2 * Math.PI * e.deltaX) / h) * speed;
      const dPol = ((2 * Math.PI * e.deltaY) / h) * speed;
      if (dAz === 0 && dPol === 0) return;

      controls.setAzimuthalAngle(controls.getAzimuthalAngle() + dAz);
      controls.setPolarAngle(
        MathUtils.clamp(
          controls.getPolarAngle() + dPol,
          controls.minPolarAngle,
          controls.maxPolarAngle,
        ),
      );
      controls.update();
      invalidate();
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, true);
  }, [active, controls, gl, invalidate]);

  return null;
}

function SceneContent() {
  const presetId = useGameStore((s) => s.presetId);
  const placement = useGameStore((s) => s.placement);
  const aiming = useGameStore((s) => s.aiming);
  const status = useGameStore((s) => s.status);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const clearBurst = useGameStore((s) => s.clearBurst);
  const touchUi = useCoarsePointer();
  const dims = getPreset(presetId).dims;
  const camDist = camDistance(dims);
  const reviewing = status === "won" || status === "draw";
  const dropMode = placement === "drop";
  const tipMode = powerUpMode === "tip";
  const watchTipPlayback = useGameStore((s) => s.watchTipPlayback);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  // Tip: drag tips the box. Swarm: 3D packages own pointers (orbit off).
  // Spectator tip commit playback also locks orbit. Clear confetti locks briefly.
  const camLocked = tipMode || tipFalling || watchTipPlayback || swarmBusy || Boolean(clearBurst);
  const orbitActive = !camLocked && (reviewing || !aiming);
  // Drop mode: orbit around and over the top, never under the box.
  const maxPolar = reviewing ? Math.PI : dropMode ? MathUtils.DEG2RAD * 78 : Math.PI;
  const minPolar = reviewing ? 0 : dropMode ? MathUtils.DEG2RAD * 8 : 0;

  return (
    <>
      <BlockNativeGestures />
      <color attach="background" args={["#0e141b"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[dims.x, dims.y * 1.2, dims.z * 0.8]} intensity={1.1} />
      <directionalLight position={[-dims.x, -dims.y * 0.4, -dims.z]} intensity={0.35} />

      <TipBoardFrame dims={dims} dropMode={dropMode} />
      <SwarmPackages dims={dims} />

      {/*
        Tip / package swarm: OrbitControls off.
        Touch: 1-finger aim; while aiming, 2nd finger + vertical drag = depth;
        2-finger from rest = orbit/pinch.
        Desktop: left-drag aim; 2-finger scroll orbit; Shift+scroll depth; pinch zoom; Space place.
        Viewport size must stay fixed when Tip toggles (mode controls overlay)
        so disabling orbit here does not look like a zoom change.
      */}
      <OrbitControls
        enablePan={!camLocked && (!touchUi || reviewing)}
        enableZoom={!camLocked}
        enableRotate={!camLocked}
        enabled={orbitActive}
        enableDamping
        dampingFactor={0.08}
        minDistance={camDist * 0.35}
        maxDistance={camDist * 2.4}
        minPolarAngle={minPolar}
        maxPolarAngle={maxPolar}
        target={[0, 0, 0]}
        mouseButtons={DESKTOP_MOUSE_BUTTONS}
        touches={
          reviewing
            ? { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
            : { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }
        }
        makeDefault
      />
      {!touchUi ? <TrackpadOrbit active={orbitActive} /> : null}
    </>
  );
}

export function GameCanvas() {
  const presetId = useGameStore((s) => s.presetId);
  const dims = getPreset(presetId).dims;
  const camDist = camDistance(dims);

  return (
    <div className="game-viewport__canvas" onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{
          position: [camDist * 0.75, camDist * 0.55, camDist * 0.85],
          fov: 45,
          near: 0.1,
          far: 500,
        }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}
