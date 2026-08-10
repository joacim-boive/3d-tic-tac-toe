"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, InstancedMesh, Object3D } from "three";
import { cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import type { BoardDims, CellCoord } from "@/game/types";
import type { SliceAxis } from "./facingSliceAxis";
import { useSliceHighlightStore } from "./sliceHighlightStore";

type ActiveSliceProps = {
  dims: BoardDims;
  spacing?: number;
};

const FILL_COLOR = "#6eb8d4";
const EDGE_COLOR = "#b8e4f2";
const temp = new Object3D();

/** Cells on the sticky depth slice (fixed axis index). */
function sliceCells(axis: SliceAxis, index: number, dims: BoardDims): CellCoord[] {
  const cells: CellCoord[] = [];
  if (axis === "x") {
    for (let y = 0; y < dims.y; y++) {
      for (let z = 0; z < dims.z; z++) {
        cells.push({ x: index, y, z });
      }
    }
    return cells;
  }
  if (axis === "y") {
    for (let x = 0; x < dims.x; x++) {
      for (let z = 0; z < dims.z; z++) {
        cells.push({ x, y: index, z });
      }
    }
    return cells;
  }
  for (let x = 0; x < dims.x; x++) {
    for (let y = 0; y < dims.y; y++) {
      cells.push({ x, y, z: index });
    }
  }
  return cells;
}

/**
 * Sticky depth highlight: every cell box on the active slice.
 * SelectionCursor owns updates; this only renders.
 * Stays visible after aim ends until the next game / axis change.
 */
export function ActiveSlice({ dims, spacing = 1 }: ActiveSliceProps) {
  const phase = useGameStore((s) => s.phase);
  const slice = useSliceHighlightStore((s) => s.slice);
  const meshRef = useRef<InstancedMesh>(null);

  const cellSize = spacing * 0.96;
  const cells = useMemo(() => {
    if (!slice) return [];
    return sliceCells(slice.axis, slice.index, dims);
  }, [slice, dims]);

  const boxGeo = useMemo(() => new BoxGeometry(cellSize, cellSize, cellSize), [cellSize]);
  const edgesGeo = useMemo(() => new EdgesGeometry(boxGeo), [boxGeo]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let i = 0;
    for (const cell of cells) {
      const [x, y, z] = cellToWorld(cell, dims, spacing);
      temp.position.set(x, y, z);
      temp.scale.setScalar(1);
      temp.rotation.set(0, 0, 0);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells, dims, spacing]);

  if (phase !== "playing" || !slice || cells.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[boxGeo, undefined, cells.length]}
        frustumCulled={false}
        renderOrder={1}
      >
        <meshBasicMaterial
          color={FILL_COLOR}
          transparent
          opacity={0.1}
          depthWrite={false}
          fog={false}
        />
      </instancedMesh>
      {cells.map((cell) => {
        const [x, y, z] = cellToWorld(cell, dims, spacing);
        return (
          <lineSegments
            key={`${cell.x},${cell.y},${cell.z}`}
            geometry={edgesGeo}
            position={[x, y, z]}
            renderOrder={2}
          >
            <lineBasicMaterial
              color={EDGE_COLOR}
              transparent
              opacity={0.55}
              depthWrite={false}
              fog={false}
            />
          </lineSegments>
        );
      })}
    </group>
  );
}
