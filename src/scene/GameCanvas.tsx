"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect, useState } from "react";
import { MathUtils, TOUCH } from "three";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { BoardColliders } from "./BoardColliders";
import { Grid } from "./Grid";
import { Markers } from "./Markers";
import { PhysicsMarkers } from "./PhysicsMarkers";
import { SelectionCursor } from "./SelectionCursor";

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
  const touchUi = useCoarsePointer();
  const dims = getPreset(presetId).dims;
  const camDist = camDistance(dims);
  // Match over: free orbit/zoom to review the line; aim gestures off.
  const reviewing = status === "won" || status === "draw";
  const dropMode = placement === "drop";
  // Drop mode: orbit around and over the top, never under the box.
  const maxPolar = dropMode ? MathUtils.DEG2RAD * 78 : Math.PI;
  const minPolar = dropMode ? MathUtils.DEG2RAD * 8 : 0;

  return (
    <>
      <BlockNativeGestures />
      <color attach="background" args={["#0e141b"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[dims.x, dims.y * 1.2, dims.z * 0.8]} intensity={1.1} />
      <directionalLight position={[-dims.x, -dims.y * 0.4, -dims.z]} intensity={0.35} />

      <Grid dims={dims} />
      <SelectionCursor dims={dims} />

      {dropMode ? (
        <Physics gravity={[0, -14, 0]} colliders={false}>
          <BoardColliders dims={dims} />
          <PhysicsMarkers dims={dims} />
        </Physics>
      ) : (
        <Markers dims={dims} />
      )}

      {/*
        Playing (touch): one-finger reserved for aiming (PAN + enablePan false = no-op);
        two-finger dolly-rotate = orbit + pinch. Mouse left-drag still rotates.
        Reviewing: one-finger orbit so the winning line can be inspected.
      */}
      <OrbitControls
        enablePan={!touchUi || reviewing}
        enableZoom
        enableRotate
        enabled={reviewing || !aiming}
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
