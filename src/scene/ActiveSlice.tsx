"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { useGameStore } from "@/game/store";
import type { BoardDims } from "@/game/types";
import { facingOuterSlice, type SliceAxis } from "./facingSliceAxis";
import { useSliceHighlightStore } from "./sliceHighlightStore";

type ActiveSliceProps = {
  dims: BoardDims;
  spacing?: number;
};

function buildPlaneLattice(
  widthCells: number,
  heightCells: number,
  spacing: number,
): BufferGeometry {
  const positions: number[] = [];
  const hw = (widthCells * spacing) / 2;
  const hh = (heightCells * spacing) / 2;

  for (let i = 0; i <= widthCells; i++) {
    const px = i * spacing - hw;
    positions.push(px, -hh, 0, px, hh, 0);
  }
  for (let j = 0; j <= heightCells; j++) {
    const py = j * spacing - hh;
    positions.push(-hw, py, 0, hw, py, 0);
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

function buildBorder(widthCells: number, heightCells: number, spacing: number): BufferGeometry {
  const hw = (widthCells * spacing) / 2;
  const hh = (heightCells * spacing) / 2;
  const positions = [
    -hw,
    -hh,
    0,
    hw,
    -hh,
    0,
    hw,
    -hh,
    0,
    hw,
    hh,
    0,
    hw,
    hh,
    0,
    -hw,
    hh,
    0,
    -hw,
    hh,
    0,
    -hw,
    -hh,
    0,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

function planeLayout(
  axis: SliceAxis,
  dims: BoardDims,
  spacing: number,
  index: number,
): {
  position: [number, number, number];
  rotation: [number, number, number];
  widthCells: number;
  heightCells: number;
} {
  // Sit on the outer lattice boundary (not the outer cell center) so nothing
  // draws in front of the "front facing side."
  const hx = (dims.x * spacing) / 2;
  const hy = (dims.y * spacing) / 2;
  const hz = (dims.z * spacing) / 2;

  if (axis === "x") {
    return {
      position: [index === 0 ? -hx : hx, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      widthCells: dims.z,
      heightCells: dims.y,
    };
  }
  if (axis === "y") {
    return {
      position: [0, index === 0 ? -hy : hy, 0],
      rotation: [-Math.PI / 2, 0, 0],
      widthCells: dims.x,
      heightCells: dims.z,
    };
  }
  return {
    position: [0, 0, index === 0 ? -hz : hz],
    rotation: [0, 0, 0],
    widthCells: dims.x,
    heightCells: dims.y,
  };
}

function sameSlice(
  a: { axis: SliceAxis; index: number } | null,
  b: { axis: SliceAxis; index: number },
): boolean {
  return a !== null && a.axis === b.axis && a.index === b.index;
}

/**
 * Highlights the outer cube face toward the camera while aiming.
 * Updates as soon as aim starts (Shift / touch drag) — not on place/drop.
 * Stays put while orbiting until the next aim.
 */
export function ActiveSlice({ dims, spacing = 1 }: ActiveSliceProps) {
  const camera = useThree((s) => s.camera);
  const phase = useGameStore((s) => s.phase);
  const aiming = useGameStore((s) => s.aiming);
  const slice = useSliceHighlightStore((s) => s.slice);
  const setSlice = useSliceHighlightStore((s) => s.setSlice);
  const clearSlice = useSliceHighlightStore((s) => s.clearSlice);

  const wasAimingRef = useRef(false);

  useFrame(() => {
    if (phase !== "playing") {
      if (slice !== null) clearSlice();
      wasAimingRef.current = false;
      return;
    }

    if (!aiming) {
      wasAimingRef.current = false;
      return;
    }

    const next = facingOuterSlice(camera.position, dims);
    // Refresh on aim start and while aiming if the front face changes.
    if (!wasAimingRef.current || !sameSlice(slice, next)) {
      setSlice(next);
    }
    wasAimingRef.current = true;
  });

  const layout = useMemo(() => {
    if (!slice) return null;
    return planeLayout(slice.axis, dims, spacing, slice.index);
  }, [slice, dims, spacing]);

  const lattice = useMemo(() => {
    if (!layout) return null;
    return buildPlaneLattice(layout.widthCells, layout.heightCells, spacing);
  }, [layout, spacing]);

  const border = useMemo(() => {
    if (!layout) return null;
    return buildBorder(layout.widthCells, layout.heightCells, spacing);
  }, [layout, spacing]);

  if (phase !== "playing" || !layout || !lattice || !border) return null;

  const width = layout.widthCells * spacing * 0.98;
  const height = layout.heightCells * spacing * 0.98;

  return (
    <group position={layout.position} rotation={layout.rotation}>
      <mesh renderOrder={1}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color="#6eb8d4"
          transparent
          opacity={0.11}
          depthWrite={false}
          side={DoubleSide}
          fog={false}
        />
      </mesh>
      <lineSegments geometry={lattice} renderOrder={2}>
        <lineBasicMaterial color="#9fd4e8" transparent opacity={0.58} depthWrite={false} fog={false} />
      </lineSegments>
      <lineSegments geometry={border} renderOrder={2}>
        <lineBasicMaterial color="#b8e4f2" transparent opacity={0.85} depthWrite={false} fog={false} />
      </lineSegments>
    </group>
  );
}
