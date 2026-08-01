"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { MathUtils, TOUCH } from "three";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { TipBoardFrame } from "./TipBoardFrame";

function camDistance(dims: { x: number; y: number; z: number }): number {
  return Math.max(dims.x, dims.y, dims.z) * 1.6 + 2;
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return coarse;
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

function SceneContent() {
  const presetId = useGameStore((s) => s.presetId);
  const placement = useGameStore((s) => s.placement);
  const aiming = useGameStore((s) => s.aiming);
  const status = useGameStore((s) => s.status);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const touchUi = useCoarsePointer();
  const dims = getPreset(presetId).dims;
  const camDist = camDistance(dims);
  const reviewing = status === "won" || status === "draw";
  const dropMode = placement === "drop";
  const tipMode = powerUpMode === "tip";
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  // Tip: drag tips the box. Swarm: overlay owns all pointers.
  // Keep OrbitControls mounted; only lock inputs — toggling `enabled` can
  // interrupt damping and feel like a zoom/framing jump on mobile.
  const camLocked = tipMode || tipFalling || swarmBusy;
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

      {/*
        Tip / package swarm: OrbitControls off.
        Otherwise: one-finger aim; two-finger orbit (touch).
        Viewport size must stay fixed when Tip toggles (mode controls overlay)
        so disabling orbit here does not look like a zoom change.
      */}
      <OrbitControls
        enablePan={!camLocked && (!touchUi || reviewing)}
        enableZoom={!camLocked}
        enableRotate={!camLocked}
        enabled={!camLocked && (reviewing || !aiming)}
        enableDamping
        dampingFactor={0.08}
        minDistance={camDist * 0.35}
        maxDistance={camDist * 2.4}
        minPolarAngle={minPolar}
        maxPolarAngle={maxPolar}
        target={[0, 0, 0]}
        touches={
          reviewing
            ? { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
            : { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }
        }
        makeDefault
      />
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
