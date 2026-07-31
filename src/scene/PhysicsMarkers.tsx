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
  MARKER_RADIUS,
  dropSpawnY,
  physicsRadius,
} from "./BoardColliders";

const WIN_COLOR = "#2dff6a";
const WIN_SCALE = 1.15;
/** Rebound speed = impact speed × e (longer falls → harder hits → higher bounce). */
const BOUNCE_E = 0.78;
const BOUNCE_DECAY = 0.55;
const MAX_BOUNCES = 3;
const SETTLE_SPEED = 0.35;
const SETTLE_DIST = 0.45;
const SETTLE_TIMEOUT_MS = 8000;
const SETTLE_FRAMES = 14;
const IMPACT_MIN = 0.55;
const BOUNCE_COOLDOWN_MS = 140;

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
  const calmFrames = useRef(0);
  const bounceCount = useRef(0);
  const sawBounce = useRef(false);
  const lastBounceAt = useRef(0);
  const spawnY = dropSpawnY(dims, spacing);
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const spawnPos = useMemo(
    (): [number, number, number] => [tx, spawnY, tz],
    [tx, spawnY, tz],
  );
  const restPos = useMemo((): [number, number, number] => [tx, ty, tz], [tx, ty, tz]);
  const colorHex = entry.winning ? WIN_COLOR : PLAYER_COLORS[entry.player];
  const color = useMemo(() => new Color(colorHex), [colorHex]);
  const scale = entry.winning ? WIN_SCALE : 1;
  const visualR = MARKER_RADIUS * scale;
  const collidersR = physicsRadius(spacing) * (entry.winning ? WIN_SCALE : 1);

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
    calmFrames.current = 0;
    bounceCount.current = 0;
    sawBounce.current = false;
    lastBounceAt.current = 0;
    const t = window.setTimeout(snapAndFinish, SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.falling]);

  useFrame(() => {
    if (!entry.falling || settledRef.current) return;
    const body = bodyRef.current;
    if (!body) return;

    const v = body.linvel();
    const p = body.translation();
    const speed = Math.hypot(v.x, v.y, v.z);
    const dist = Math.hypot(p.x - tx, p.y - ty, p.z - tz);
    const now = performance.now();

    /*
     * Impact-scaled bounce, applied after the physics step so Rapier's
     * contact solver can't immediately overwrite the rebound.
     * Trigger when falling through the landing plane at the target cell.
     */
    if (
      v.y < -IMPACT_MIN &&
      p.y <= ty + 0.04 &&
      bounceCount.current < MAX_BOUNCES &&
      now - lastBounceAt.current >= BOUNCE_COOLDOWN_MS
    ) {
      const impact = -v.y;
      const e = BOUNCE_E * Math.pow(BOUNCE_DECAY, bounceCount.current);
      bounceCount.current += 1;
      lastBounceAt.current = now;
      sawBounce.current = true;
      body.setTranslation({ x: tx, y: ty, z: tz }, true);
      body.setLinvel({ x: v.x * 0.08, y: impact * e, z: v.z * 0.08 }, true);
      return;
    }

    if (v.y > 0.35) sawBounce.current = true;
    if (!sawBounce.current) return;

    const nearRest = speed < SETTLE_SPEED && dist < SETTLE_DIST && p.y <= ty + 0.4;
    if (nearRest) {
      calmFrames.current += 1;
      if (calmFrames.current >= SETTLE_FRAMES) snapAndFinish();
    } else {
      calmFrames.current = 0;
    }
  });

  if (!entry.falling) {
    return (
      <RigidBody type="fixed" position={restPos} colliders={false} ccd>
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

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={spawnPos}
      colliders={false}
      linearDamping={0}
      angularDamping={0.2}
      ccd
      canSleep={false}
    >
      <BallCollider args={[collidersR]} restitution={0} friction={DROP_FRICTION} density={1} />
      <mesh castShadow={false}>
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
