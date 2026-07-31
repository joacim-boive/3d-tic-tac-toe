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
/** Don't freeze until the piece has had time to fall + bounce. */
const MIN_FALL_MS = 750;
const SETTLE_SPEED = 0.4;
const SETTLE_DIST = 0.4;
const SETTLE_TIMEOUT_MS = 4000;
/** Require N consecutive calm frames before snapping (avoids freezing at bounce apex). */
const SETTLE_FRAMES = 6;

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
  const bornAt = useRef(performance.now());
  const calmFrames = useRef(0);
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
    bornAt.current = performance.now();
    calmFrames.current = 0;
    const t = window.setTimeout(snapAndFinish, SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // Settle once per falling mount; snapAndFinish closes over latest tx/ty/tz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.falling]);

  useFrame(() => {
    if (!entry.falling || settledRef.current) return;
    const body = bodyRef.current;
    if (!body) return;
    if (performance.now() - bornAt.current < MIN_FALL_MS) return;

    const v = body.linvel();
    const p = body.translation();
    const speed = Math.hypot(v.x, v.y, v.z);
    const dist = Math.hypot(p.x - tx, p.y - ty, p.z - tz);
    const nearRest = speed < SETTLE_SPEED && dist < SETTLE_DIST && p.y <= ty + 0.35;

    if (nearRest) {
      calmFrames.current += 1;
      if (calmFrames.current >= SETTLE_FRAMES) snapAndFinish();
    } else {
      calmFrames.current = 0;
    }
  });

  const position: [number, number, number] = entry.falling ? [tx, spawnY, tz] : [tx, ty, tz];

  return (
    <RigidBody
      ref={bodyRef}
      type={entry.falling ? "dynamic" : "fixed"}
      position={position}
      colliders={false}
      linearDamping={0.08}
      angularDamping={0.35}
      ccd
    >
      <BallCollider
        args={[radius]}
        restitution={DROP_RESTITUTION}
        friction={DROP_FRICTION}
        density={1.2}
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
