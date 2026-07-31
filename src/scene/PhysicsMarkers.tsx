"use client";

import { useFrame } from "@react-three/fiber";
import { BallCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Mesh } from "three";
import { cellKey, cellToWorld, parseCellKey } from "@/game/board";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims, type CellCoord, type PlayerId } from "@/game/types";
import {
  DROP_FRICTION,
  DROP_GRAVITY,
  MARKER_RADIUS,
  dropSpawnY,
  physicsRadius,
} from "./BoardColliders";

const WIN_COLOR = "#2dff6a";
const WIN_SCALE = 1.15;
/** Rebound = impact × e. Longer falls → higher impact → higher bounce. */
const BOUNCE_E = 0.72;
const BOUNCE_DECAY = 0.5;
const MAX_BOUNCES = 3;
const SETTLE_SPEED = 0.4;
const SETTLE_TIMEOUT_MS = 10000;

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

/**
 * Kinematic drop: integrate gravity ourselves so acceleration and
 * impact-scaled bounce are reliable (Rapier contact solving was eating rebounds).
 * Settled pieces become fixed Rapier bodies for a future tilt power-up.
 */
function FallingMarker({
  entry,
  dims,
  spacing,
}: {
  entry: MarkerEntry;
  dims: BoardDims;
  spacing: number;
}) {
  const finishDrop = useGameStore((s) => s.finishDrop);
  const meshRef = useRef<Mesh>(null);
  const finished = useRef(false);
  const yRef = useRef(dropSpawnY(dims, spacing));
  const vyRef = useRef(0);
  const bounces = useRef(0);
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const g = DROP_GRAVITY[1]; // negative
  const color = useMemo(() => new Color(PLAYER_COLORS[entry.player]), [entry.player]);
  const visualR = MARKER_RADIUS;

  useEffect(() => {
    yRef.current = dropSpawnY(dims, spacing);
    vyRef.current = 0;
    bounces.current = 0;
    finished.current = false;
    const t = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      finishDrop();
    }, SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [dims, spacing, finishDrop, entry.key]);

  useFrame((_, dt) => {
    if (finished.current || !meshRef.current) return;
    const step = Math.min(dt, 1 / 30);

    // Natural acceleration: v += g·dt, y += v·dt
    vyRef.current += g * step;
    yRef.current += vyRef.current * step;

    // Impact against the landing cell plane — bounce ∝ impact speed.
    if (yRef.current <= ty && vyRef.current < 0) {
      const impact = -vyRef.current;
      yRef.current = ty;
      if (bounces.current < MAX_BOUNCES && impact > SETTLE_SPEED) {
        const e = BOUNCE_E * Math.pow(BOUNCE_DECAY, bounces.current);
        vyRef.current = impact * e;
        bounces.current += 1;
      } else {
        vyRef.current = 0;
        finished.current = true;
        meshRef.current.position.set(tx, ty, tz);
        finishDrop();
        return;
      }
    }

    // Settled after at least one bounce when nearly at rest on the cell.
    if (
      bounces.current > 0 &&
      Math.abs(vyRef.current) < SETTLE_SPEED &&
      yRef.current <= ty + 0.05
    ) {
      finished.current = true;
      yRef.current = ty;
      vyRef.current = 0;
      meshRef.current.position.set(tx, ty, tz);
      finishDrop();
      return;
    }

    meshRef.current.position.set(tx, yRef.current, tz);
  });

  return (
    <mesh ref={meshRef} position={[tx, yRef.current, tz]} castShadow={false}>
      <sphereGeometry args={[visualR, 20, 16]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.9}
        roughness={0.28}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={0.22}
        depthWrite={false}
      />
    </mesh>
  );
}

function SettledMarker({
  entry,
  dims,
  spacing,
}: {
  entry: MarkerEntry;
  dims: BoardDims;
  spacing: number;
}) {
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const colorHex = entry.winning ? WIN_COLOR : PLAYER_COLORS[entry.player];
  const color = useMemo(() => new Color(colorHex), [colorHex]);
  const scale = entry.winning ? WIN_SCALE : 1;
  const visualR = MARKER_RADIUS * scale;
  const collidersR = physicsRadius(spacing) * scale;

  return (
    <RigidBody type="fixed" position={[tx, ty, tz]} colliders={false} ccd>
      <BallCollider args={[collidersR]} restitution={0} friction={DROP_FRICTION} density={1} />
      <mesh castShadow={false}>
        <sphereGeometry args={[visualR, 20, 16]} />
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

function MarkerBody({
  entry,
  dims,
  spacing,
}: {
  entry: MarkerEntry;
  dims: BoardDims;
  spacing: number;
}) {
  if (entry.falling) {
    return <FallingMarker entry={entry} dims={dims} spacing={spacing} />;
  }
  return <SettledMarker entry={entry} dims={dims} spacing={spacing} />;
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
