"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DynamicDrawUsage, InstancedMesh, Object3D, SphereGeometry } from "three";
import { cellToWorld } from "@/game/board";
import { axisLineCells, clearFixedFromCursor } from "@/game/clearRow";
import { useGameStore } from "@/game/store";
import type { BoardDims } from "@/game/types";

/** Amber highlight — distinct from coral/cyan markers. */
const CLEAR_COLOR = "#f0c14a";

type ClearRowHighlightProps = {
  dims: BoardDims;
  spacing?: number;
};

/**
 * Translucent spheres along the clear-target line (axis + cursor).
 */
export function ClearRowHighlight({ dims, spacing = 1 }: ClearRowHighlightProps) {
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const clearAxis = useGameStore((s) => s.clearAxis);
  const cursor = useGameStore((s) => s.cursor);
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(0.3, 16, 12), []);
  const color = useMemo(() => new Color(CLEAR_COLOR), []);
  const temp = useMemo(() => new Object3D(), []);

  const cells = useMemo(() => {
    if (powerUpMode !== "clear-row") return [];
    const { a, b } = clearFixedFromCursor(clearAxis, cursor);
    return axisLineCells(dims, clearAxis, a, b);
  }, [powerUpMode, clearAxis, cursor, dims]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < cells.length; i++) {
      const [x, y, z] = cellToWorld(cells[i]!, dims, spacing);
      temp.position.set(x, y, z);
      temp.scale.setScalar(1);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    }
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells, dims, spacing, temp]);

  if (powerUpMode !== "clear-row" || cells.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, Math.max(1, cells.length)]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.42}
        roughness={0.35}
        metalness={0.15}
        emissive={color}
        emissiveIntensity={0.35}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
