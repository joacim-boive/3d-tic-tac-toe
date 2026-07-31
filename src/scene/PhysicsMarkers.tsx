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
/**
 * Bowling-ball rebound: low e, dies fast.
 * Still scales with impact (longer fall → slightly bigger thud-bounce).
 */
const BOUNCE_E = 0.26;
const BOUNCE_DECAY = 0.35;
const MAX_BOUNCES = 2;
/** Hard cap on the whole drop animation (fall + bounces). */
const MAX_DROP_DURATION = 1;

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

type DropPhase = {
  /** Absolute time (s) when this phase starts. */
  t0: number;
  /** Height at phase start. */
  y0: number;
  /** Upward speed at phase start (0 for the initial fall). */
  v0: number;
};

/**
 * Build fall + muted bounce phases (bowling-ball thud, not tennis ball).
 * Longer falls still hit harder → slightly bigger first bounce.
 */
function buildDropPhases(spawnY: number, landY: number, g: number): {
  phases: DropPhase[];
  totalDuration: number;
} {
  const grav = Math.abs(g);
  const phases: DropPhase[] = [];
  let tCursor = 0;
  const height = Math.max(0.05, spawnY - landY);

  const fallT = Math.sqrt((2 * height) / grav);
  phases.push({ t0: 0, y0: spawnY, v0: 0 });
  tCursor += fallT;
  let impact = grav * fallT;

  for (let i = 0; i < MAX_BOUNCES; i++) {
    const e = BOUNCE_E * Math.pow(BOUNCE_DECAY, i);
    const up = impact * e;
    // Skip chatter — heavy pieces don't keep hopping.
    if (up < 0.85) break;
    phases.push({ t0: tCursor, y0: landY, v0: up });
    tCursor += (2 * up) / grav;
    impact = up;
  }

  tCursor += 0.05;
  return { phases, totalDuration: Math.min(tCursor, MAX_DROP_DURATION) };
}

function sampleDropY(phases: DropPhase[], landY: number, g: number, t: number): number {
  // Find active phase (last whose t0 <= t).
  let phase = phases[0]!;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (t >= phases[i]!.t0) {
      phase = phases[i]!;
      break;
    }
  }
  const localT = t - phase.t0;
  if (phase.v0 === 0) {
    // Free fall from rest: y = y0 + 0.5*g*t^2 (g negative).
    return Math.max(landY, phase.y0 + 0.5 * g * localT * localT);
  }
  // Bounce hop: y = landY + v0*t + 0.5*g*t^2
  return Math.max(landY, landY + phase.v0 * localT + 0.5 * g * localT * localT);
}

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
  const startedAt = useRef(performance.now());
  const spawnY = dropSpawnY(dims, spacing);
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const g = DROP_GRAVITY[1];
  const plan = useMemo(() => buildDropPhases(spawnY, ty, g), [spawnY, ty, g]);
  const color = useMemo(() => new Color(PLAYER_COLORS[entry.player]), [entry.player]);

  useEffect(() => {
    finished.current = false;
    startedAt.current = performance.now();
    if (meshRef.current) meshRef.current.position.set(tx, spawnY, tz);
  }, [tx, spawnY, tz, entry.key]);

  useFrame(() => {
    if (finished.current || !meshRef.current) return;
    const t = (performance.now() - startedAt.current) / 1000;
    if (t >= plan.totalDuration) {
      finished.current = true;
      meshRef.current.position.set(tx, ty, tz);
      finishDrop();
      return;
    }
    const y = sampleDropY(plan.phases, ty, g, t);
    meshRef.current.position.set(tx, y, tz);
  });

  return (
    <mesh ref={meshRef} position={[tx, spawnY, tz]} castShadow={false}>
      <sphereGeometry args={[MARKER_RADIUS, 20, 16]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.92}
        roughness={0.28}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={0.25}
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
