"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DynamicDrawUsage, InstancedMesh, Object3D, SphereGeometry } from "three";
import { cellKey, cellToWorld, parseCellKey } from "@/game/board";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims, type CellCoord, type PlayerId } from "@/game/types";

const MAX_INSTANCES = 20 * 20 * 20;
const temp = new Object3D();
const WIN_COLOR = "#2dff6a";
const WIN_SCALE = 1.15;
/** Subtle continuous bob so the winning line stays readable after the board settles. */
const WIN_BOUNCE_AMP = 0.1;
const WIN_BOUNCE_HZ = 1.6;

type MarkersProps = {
  dims: BoardDims;
  spacing?: number;
};

function PlayerMarkers({
  player,
  dims,
  spacing,
  winSet,
}: {
  player: PlayerId;
  dims: BoardDims;
  spacing: number;
  winSet: Set<string>;
}) {
  const board = useGameStore((s) => s.board);
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(0.32, 16, 12), []);
  const color = useMemo(() => new Color(PLAYER_COLORS[player]), [player]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);

    let i = 0;
    for (const [key, owner] of board) {
      if (owner !== player) continue;
      if (winSet.has(key)) continue;
      const coord = parseCellKey(key);
      const [x, y, z] = cellToWorld(coord, dims, spacing);
      temp.position.set(x, y, z);
      temp.scale.setScalar(1);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }, [board, player, dims, spacing, winSet]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, MAX_INSTANCES]} frustumCulled={false}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.88}
        roughness={0.28}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={0.22}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function WinningMarkers({
  dims,
  spacing,
  winningLine,
}: {
  dims: BoardDims;
  spacing: number;
  winningLine: CellCoord[];
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(0.32, 16, 12), []);
  const color = useMemo(() => new Color(WIN_COLOR), []);
  const basesRef = useRef<Array<[number, number, number]>>([]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    basesRef.current = winningLine.map((c) => cellToWorld(c, dims, spacing));

    for (let i = 0; i < basesRef.current.length; i++) {
      const [x, y, z] = basesRef.current[i]!;
      temp.position.set(x, y, z);
      temp.scale.setScalar(WIN_SCALE);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    }
    mesh.count = winningLine.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [winningLine, dims, spacing]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    const bases = basesRef.current;
    if (!mesh || bases.length === 0) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < bases.length; i++) {
      const [x, y, z] = bases[i]!;
      // Slight phase stagger so the line reads as a connected set, not one blob.
      const bob = Math.sin((t * WIN_BOUNCE_HZ + i * 0.35) * Math.PI * 2) * WIN_BOUNCE_AMP;
      temp.position.set(x, y + bob, z);
      temp.scale.setScalar(WIN_SCALE);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (winningLine.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, winningLine.length]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.22}
        metalness={0.15}
        emissive={color}
        emissiveIntensity={0.45}
      />
    </instancedMesh>
  );
}

export function Markers({ dims, spacing = 1 }: MarkersProps) {
  const winningLine = useGameStore((s) => s.winningLine);

  const winSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of winningLine) {
      set.add(cellKey(c.x, c.y, c.z));
    }
    return set;
  }, [winningLine]);

  return (
    <>
      <PlayerMarkers player="a" dims={dims} spacing={spacing} winSet={winSet} />
      <PlayerMarkers player="b" dims={dims} spacing={spacing} winSet={winSet} />
      <WinningMarkers dims={dims} spacing={spacing} winningLine={winningLine} />
    </>
  );
}
