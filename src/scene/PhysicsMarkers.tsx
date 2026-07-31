"use client";

import { useFrame } from "@react-three/fiber";
import { BallCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Color } from "three";
import { cellKey, cellToWorld, parseCellKey } from "@/game/board";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims, type CellCoord, type PlayerId } from "@/game/types";
import {
  DROP_FRICTION,
  DROP_RESTITUTION,
  MARKER_RADIUS,
  dropSpawnY,
} from "./BoardColliders";

const WIN_COLOR = "#2dff6a";
const WIN_SCALE = 1.15;
const SETTLE_SPEED = 0.22;
const SETTLE_DIST = 0.55;
const SETTLE_TIMEOUT_MS = 2800;

type PhysicsMarkersProps = {
  dims: BoardDims;
  spacing?: number;
};

type MarkerEntry = {
  key: string;
  coord: CellCoord;
  player: PlayerId;
  winning: boolean;
  falling: boolean;
};

function MarkerBody({
  entry,
  dims,
  spacing,
}: {
  entry: MarkerEntry;
  dims: BoardDims;
  spacing: number;
}) {
  const finishDrop = useGameStore((s) => s.finishDrop);
  const bodyRef = useRef<RapierRigidBody>(null);
  const settledRef = useRef(!entry.falling);
  const spawnY = dropSpawnY(dims, spacing);
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const colorHex = entry.winning ? WIN_COLOR : PLAYER_COLORS[entry.player];
  const color = useMemo(() => new Color(colorHex), [colorHex]);
  const scale = entry.winning ? WIN_SCALE : 1;
  const radius = MARKER_RADIUS * scale;

  const snapAndFinish = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const body = bodyRef.current;
    if (body) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setTranslation({ x: tx, y: ty, z: tz }, true);
      body.setBodyType(1, true); // Fixed
    }
    finishDrop();
  };

  useEffect(() => {
    if (!entry.falling) return;
    const t = window.setTimeout(snapAndFinish, SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle once per falling mount
  }, [entry.falling]);

  useFrame(() => {
    if (!entry.falling || settledRef.current) return;
    const body = bodyRef.current;
    if (!body) return;
    const v = body.linvel();
    const p = body.translation();
    const speed = Math.hypot(v.x, v.y, v.z);
    const dist = Math.hypot(p.x - tx, p.y - ty, p.z - tz);
    if (speed < SETTLE_SPEED && dist < SETTLE_DIST && p.y <= ty + 0.45) {
      snapAndFinish();
    }
  });

  const position: [number, number, number] = entry.falling ? [tx, spawnY, tz] : [tx, ty, tz];

  return (
    <RigidBody
      ref={bodyRef}
      type={entry.falling ? "dynamic" : "fixed"}
      position={position}
      colliders={false}
      linearDamping={0.15}
      angularDamping={0.4}
      ccd
    >
      <BallCollider
        args={[radius]}
        restitution={DROP_RESTITUTION}
        friction={DROP_FRICTION}
        density={1}
      />
      <mesh castShadow={false}>
        <sphereGeometry args={[radius, 20, 16]} />
        <meshStandardMaterial
          color={color}
          transparent={!entry.winning}
          opacity={entry.winning ? 1 : 0.9}
          roughness={0.28}
          metalness={0.2}
          emissive={color}
          emissiveIntensity={entry.winning ? 0.45 : 0.22}
          depthWrite={entry.winning}
        />
      </mesh>
    </RigidBody>
  );
}

export function PhysicsMarkers({ dims, spacing = 1 }: PhysicsMarkersProps) {
  const board = useGameStore((s) => s.board);
  const winningLine = useGameStore((s) => s.winningLine);
  const fallingKey = useGameStore((s) => s.fallingKey);

  const winSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of winningLine) set.add(cellKey(c.x, c.y, c.z));
    return set;
  }, [winningLine]);

  const entries = useMemo(() => {
    const list: MarkerEntry[] = [];
    for (const [key, player] of board) {
      list.push({
        key,
        coord: parseCellKey(key),
        player,
        winning: winSet.has(key),
        falling: key === fallingKey,
      });
    }
    return list;
  }, [board, winSet, fallingKey]);

  return (
    <>
      {entries.map((entry) => (
        <MarkerBody key={entry.key} entry={entry} dims={dims} spacing={spacing} />
      ))}
    </>
  );
}
