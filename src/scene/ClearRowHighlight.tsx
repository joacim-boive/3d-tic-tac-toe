"use client";

import { useMemo } from "react";
import { Color } from "three";
import { cellToWorld } from "@/game/board";
import { clearFixedFromCursor, type Axis } from "@/game/clearRow";
import { useGameStore } from "@/game/store";
import type { BoardDims, CellCoord } from "@/game/types";

/** Soft red — destructive clear shaft (distinct from coral/cyan markers). */
const CLEAR_COLOR = "#ff3a3a";

type ClearRowHighlightProps = {
  dims: BoardDims;
  spacing?: number;
};

function shaftWorld(
  axis: Axis,
  a: number,
  b: number,
  dims: BoardDims,
  spacing: number,
): { position: [number, number, number]; size: [number, number, number] } {
  const span = 0.96;
  const cross = spacing * 0.88;
  const mid = (n: number) => Math.floor((n - 1) / 2);

  let cell: CellCoord;
  if (axis === "x") {
    cell = { x: mid(dims.x), y: a, z: b };
  } else if (axis === "y") {
    cell = { x: a, y: mid(dims.y), z: b };
  } else {
    cell = { x: a, y: b, z: mid(dims.z) };
  }

  const [wx, wy, wz] = cellToWorld(cell, dims, spacing);
  // Center the shaft on the board mid along the varying axis (world origin on that axis).
  if (axis === "x") {
    return {
      position: [0, wy, wz],
      size: [dims.x * spacing * span, cross, cross],
    };
  }
  if (axis === "y") {
    return {
      position: [wx, 0, wz],
      size: [cross, dims.y * spacing * span, cross],
    };
  }
  return {
    position: [wx, wy, 0],
    size: [cross, cross, dims.z * spacing * span],
  };
}

/**
 * One translucent red column/shaft along the clear-target line — cleaner than per-cell spheres.
 */
export function ClearRowHighlight({ dims, spacing = 1 }: ClearRowHighlightProps) {
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const clearAxis = useGameStore((s) => s.clearAxis);
  const cursor = useGameStore((s) => s.cursor);
  const color = useMemo(() => new Color(CLEAR_COLOR), []);

  if (powerUpMode !== "clear-row") return null;

  const { a, b } = clearFixedFromCursor(clearAxis, cursor);
  const { position, size } = shaftWorld(clearAxis, a, b, dims, spacing);

  return (
    <mesh position={position} renderOrder={2}>
      <boxGeometry args={size} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.22}
        depthWrite={false}
      />
    </mesh>
  );
}
