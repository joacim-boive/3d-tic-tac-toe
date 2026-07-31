"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  SphereGeometry,
} from "three";
import { cellKey, cellToWorld } from "@/game/board";
import { axisLineCells, clearFixedFromCursor } from "@/game/clearRow";
import { useGameStore } from "@/game/store";
import type { BoardDims } from "@/game/types";

/** Hot red — destructive clear preview (distinct from coral/cyan markers). */
const CLEAR_COLOR = "#ff2a2a";

type ClearRowHighlightProps = {
  dims: BoardDims;
  spacing?: number;
};

/**
 * Glowing red translucent spheres along the clear-target line (axis + cursor).
 * Occupied cells glow hotter so the wipe reads as a power-up, not a place ghost.
 */
export function ClearRowHighlight({ dims, spacing = 1 }: ClearRowHighlightProps) {
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const clearAxis = useGameStore((s) => s.clearAxis);
  const cursor = useGameStore((s) => s.cursor);
  const board = useGameStore((s) => s.board);
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(0.32, 20, 16), []);
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
      const cell = cells[i]!;
      const occupied = board.has(cellKey(cell.x, cell.y, cell.z));
      const [x, y, z] = cellToWorld(cell, dims, spacing);
      temp.position.set(x, y, z);
      // Occupied = hotter / larger; empty = softer danger ghost.
      temp.scale.setScalar(occupied ? 1.12 : 0.92);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    }
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells, board, dims, spacing, temp]);

  if (powerUpMode !== "clear-row" || cells.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, Math.max(1, cells.length)]}
      frustumCulled={false}
      renderOrder={2}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.55}
        roughness={0.2}
        metalness={0.05}
        emissive={color}
        emissiveIntensity={1.35}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </instancedMesh>
  );
}
