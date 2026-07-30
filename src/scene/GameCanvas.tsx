"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { Grid } from "./Grid";
import { Markers } from "./Markers";
import { SelectionCursor } from "./SelectionCursor";

function camDistance(dims: { x: number; y: number; z: number }): number {
  return Math.max(dims.x, dims.y, dims.z) * 1.6 + 2;
}

function SceneContent() {
  const presetId = useGameStore((s) => s.presetId);
  const aiming = useGameStore((s) => s.aiming);
  const dims = getPreset(presetId).dims;
  const camDist = camDistance(dims);

  return (
    <>
      <color attach="background" args={["#0e141b"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[dims.x, dims.y * 1.2, dims.z * 0.8]} intensity={1.1} />
      <directionalLight position={[-dims.x, -dims.y * 0.4, -dims.z]} intensity={0.35} />

      <Grid dims={dims} />
      <Markers dims={dims} />
      <SelectionCursor dims={dims} />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        enabled={!aiming}
        enableDamping
        dampingFactor={0.08}
        minDistance={camDist * 0.35}
        maxDistance={camDist * 2.4}
        target={[0, 0, 0]}
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
    <div className="game-viewport__canvas">
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
