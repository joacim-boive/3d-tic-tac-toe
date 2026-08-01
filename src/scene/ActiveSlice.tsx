"use client";

import { useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import type { BoardDims } from "@/game/types";

type ActiveSliceProps = {
  dims: BoardDims;
  spacing?: number;
};

/**
 * Soft fill + brighter XY lattice on the cursor's Z layer so depth (Q/E) is obvious
 * without hiding the rest of the board.
 */
export function ActiveSlice({ dims, spacing = 1 }: ActiveSliceProps) {
  const cursor = useGameStore((s) => s.cursor);
  const status = useGameStore((s) => s.status);

  const lattice = useMemo(() => {
    const positions: number[] = [];
    const hx = (dims.x * spacing) / 2;
    const hy = (dims.y * spacing) / 2;

    for (let i = 0; i <= dims.x; i++) {
      const px = i * spacing - hx;
      positions.push(px, -hy, 0, px, hy, 0);
    }
    for (let j = 0; j <= dims.y; j++) {
      const py = j * spacing - hy;
      positions.push(-hx, py, 0, hx, py, 0);
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geo;
  }, [dims.x, dims.y, spacing]);

  const border = useMemo(() => {
    const hx = (dims.x * spacing) / 2;
    const hy = (dims.y * spacing) / 2;
    const positions = [
      -hx,
      -hy,
      0,
      hx,
      -hy,
      0,
      hx,
      -hy,
      0,
      hx,
      hy,
      0,
      hx,
      hy,
      0,
      -hx,
      hy,
      0,
      -hx,
      hy,
      0,
      -hx,
      -hy,
      0,
    ];
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geo;
  }, [dims.x, dims.y, spacing]);

  if (status !== "playing") return null;

  const [, , cz] = cellToWorld(cursor, dims, spacing);
  const width = dims.x * spacing * 0.98;
  const height = dims.y * spacing * 0.98;

  return (
    <group position={[0, 0, cz]}>
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
