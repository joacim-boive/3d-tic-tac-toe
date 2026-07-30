"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { TOUCH } from "three";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { Grid } from "./Grid";
import { Markers } from "./Markers";
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
  const aiming = useGameStore((s) => s.aiming);
  const touchUi = useCoarsePointer();
  const dims = getPreset(presetId).dims;
  const camDist = camDistance(dims);

  return (
    <>
      <BlockNativeGestures />
      <color attach="background" args={["#0e141b"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[dims.x, dims.y * 1.2, dims.z * 0.8]} intensity={1.1} />
      <directionalLight position={[-dims.x, -dims.y * 0.4, -dims.z]} intensity={0.35} />

      <Grid dims={dims} />
      <Markers dims={dims} />
      <SelectionCursor dims={dims} />

      {/*
        Touch: one-finger reserved for aiming (PAN mapping + enablePan false = no-op).
        Two-finger dolly-rotate = orbit + pinch zoom. Mouse left-drag still rotates.
      */}
      <OrbitControls
        enablePan={!touchUi}
        enableZoom
        enableRotate
        enabled={!aiming}
        enableDamping
        dampingFactor={0.08}
        minDistance={camDist * 0.35}
        maxDistance={camDist * 2.4}
        target={[0, 0, 0]}
        touches={{
          ONE: TOUCH.PAN,
          TWO: TOUCH.DOLLY_ROTATE,
        }}
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
