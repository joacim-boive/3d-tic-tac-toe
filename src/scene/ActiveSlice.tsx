"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, InstancedMesh, Object3D } from "three";
import { cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import type { BoardDims, CellCoord } from "@/game/types";
import { isFlatBoard, type SliceAxis } from "./facingSliceAxis";
import { useSliceHighlightStore } from "./sliceHighlightStore";

type ActiveSliceProps = {
  dims: BoardDims;
  spacing?: number;
};

/** Cool cyan — distinct from coral markers; aim box uses a brighter rim on top. */
const FILL_COLOR = "#7ec8e0";
const EDGE_COLOR = "#d4f2ff";
const FRAME_COLOR = "#f2fbff";
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

/** Outer wireframe box framing the whole sticky slice. */
function sliceFrame(
  axis: SliceAxis,
  index: number,
  dims: BoardDims,
  spacing: number,
  cellSize: number,
): { position: [number, number, number]; size: [number, number, number] } {
  const mid = (n: number) => Math.floor((n - 1) / 2);
  const span = (n: number) => n * spacing * 0.96;
  const cell =
    axis === "x"
      ? { x: index, y: mid(dims.y), z: mid(dims.z) }
      : axis === "y"
        ? { x: mid(dims.x), y: index, z: mid(dims.z) }
        : { x: mid(dims.x), y: mid(dims.y), z: index };
  const [wx, wy, wz] = cellToWorld(cell, dims, spacing);

  if (axis === "x") {
    return {
      position: [wx, 0, 0],
      size: [cellSize, span(dims.y), span(dims.z)],
    };
  }
  if (axis === "y") {
    return {
      position: [0, wy, 0],
      size: [span(dims.x), cellSize, span(dims.z)],
    };
  }
  return {
    position: [0, 0, wz],
    size: [span(dims.x), span(dims.y), cellSize],
  };
}

/**
 * Sticky depth highlight: every cell box on the active slice.
 * SelectionCursor owns updates; this only renders.
 * Stays visible after aim ends until outside click, axis change, or reset.
 */
export function ActiveSlice({ dims, spacing = 1 }: ActiveSliceProps) {
  const phase = useGameStore((s) => s.phase);
  const slice = useSliceHighlightStore((s) => s.slice);
  const meshRef = useRef<InstancedMesh>(null);

  const cellSize = spacing * 0.96;
  const cells = useMemo(() => {
    if (!slice || isFlatBoard(dims)) return [];
    return sliceCells(slice.axis, slice.index, dims);
  }, [slice, dims]);

  const boxGeo = useMemo(() => new BoxGeometry(cellSize, cellSize, cellSize), [cellSize]);
  const edgesGeo = useMemo(() => new EdgesGeometry(boxGeo), [boxGeo]);

  const frame = useMemo(() => {
    if (!slice || isFlatBoard(dims)) return null;
    return sliceFrame(slice.axis, slice.index, dims, spacing, cellSize);
  }, [slice, dims, spacing, cellSize]);

  /** Nested edge shells so the outer silhouette reads thicker than 1px WebGL lines. */
  const frameEdgeShells = useMemo(() => {
    if (!frame) return [];
    const [sx, sy, sz] = frame.size;
    const pads = [0, 0.012, 0.024];
    return pads.map((pad) => {
      const box = new BoxGeometry(sx + pad, sy + pad, sz + pad);
      const geo = new EdgesGeometry(box);
      box.dispose();
      return geo;
    });
  }, [frame]);

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

  if (phase !== "playing" || !slice || cells.length === 0 || !frame) {
    return null;
  }

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
          opacity={0.22}
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
              opacity={0.9}
              depthWrite={false}
              fog={false}
            />
          </lineSegments>
        );
      })}
      {frameEdgeShells.map((geo, i) => (
        <lineSegments key={i} geometry={geo} position={frame.position} renderOrder={3}>
          <lineBasicMaterial
            color={FRAME_COLOR}
            transparent
            opacity={0.95 - i * 0.12}
            depthWrite={false}
            fog={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}
