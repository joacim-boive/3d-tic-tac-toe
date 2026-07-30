"use client";

import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import type { BoardDims } from "@/game/types";

type GridProps = {
  dims: BoardDims;
  spacing?: number;
};

/**
 * Cell-boundary lattice (N+1 planes per axis) so an N³ board reads as N cells,
 * not N−1.
 */
export function Grid({ dims, spacing = 1 }: GridProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const hx = (dims.x * spacing) / 2;
    const hy = (dims.y * spacing) / 2;
    const hz = (dims.z * spacing) / 2;

    // Planes of constant X (dims.x + 1)
    for (let i = 0; i <= dims.x; i++) {
      const px = i * spacing - hx;
      for (let j = 0; j <= dims.y; j++) {
        const py = j * spacing - hy;
        positions.push(px, py, -hz, px, py, hz);
      }
      for (let k = 0; k <= dims.z; k++) {
        const pz = k * spacing - hz;
        positions.push(px, -hy, pz, px, hy, pz);
      }
    }
    // Planes of constant Y — remaining edges not already drawn as X-plane spans
    for (let j = 0; j <= dims.y; j++) {
      const py = j * spacing - hy;
      for (let k = 0; k <= dims.z; k++) {
        const pz = k * spacing - hz;
        positions.push(-hx, py, pz, hx, py, pz);
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geo;
  }, [dims.x, dims.y, dims.z, spacing]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#8a9bab" transparent opacity={0.4} depthWrite={false} />
    </lineSegments>
  );
}
