"use client";

import { useFrame } from "@react-three/fiber";
import { BallCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Mesh, type MeshStandardMaterial } from "three";
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
/** Match free-mode winning bob (world units / Hz). */
const WIN_BOUNCE_AMP = 0.1;
const WIN_BOUNCE_HZ = 1.6;
/**
 * Satisfying heavy settle: one clear thud-bounce, then dead.
 * e still scales with impact so empty-column drops feel weightier.
 */
const BOUNCE_E = 0.24;
const MAX_BOUNCES = 1;
const MAX_DROP_DURATION = 1;
/** Squash on impact (scaleY / scaleXZ). */
const SQUASH = 0.72;
const STRETCH = 1.14;
const IMPACT_FLASH = 0.7;

type PhysicsMarkersProps = {
  dims: BoardDims;
  spacing?: number;
};

type MarkerEntry = {
  key: string;
  coord: CellCoord;
  player: PlayerId;
  winning: boolean;
  /** True only for the mark that completed the line. */
  winningMove: boolean;
  falling: boolean;
  /** Stagger delay before release (restore drop-in). */
  delayMs: number;
};

type DropPhase = {
  t0: number;
  y0: number;
  v0: number;
};

type DropPlan = {
  phases: DropPhase[];
  totalDuration: number;
  fallEnd: number;
  impactSpeed: number;
};

function buildDropPhases(spawnY: number, landY: number, g: number): DropPlan {
  const grav = Math.abs(g);
  const phases: DropPhase[] = [];
  let tCursor = 0;
  const height = Math.max(0.05, spawnY - landY);

  const fallT = Math.sqrt((2 * height) / grav);
  phases.push({ t0: 0, y0: spawnY, v0: 0 });
  tCursor += fallT;
  const fallEnd = tCursor;
  const impactSpeed = grav * fallT;

  // One punchy bounce — height tracks impact, then it sticks.
  const up = impactSpeed * BOUNCE_E;
  if (up >= 0.7 && MAX_BOUNCES > 0) {
    phases.push({ t0: tCursor, y0: landY, v0: up });
    tCursor += (2 * up) / grav;
  }

  // Brief settle breath so the stick reads as intentional.
  tCursor += 0.06;
  return {
    phases,
    totalDuration: Math.min(tCursor, MAX_DROP_DURATION),
    fallEnd,
    impactSpeed,
  };
}

function sampleDropY(phases: DropPhase[], landY: number, g: number, t: number): number {
  let phase = phases[0]!;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (t >= phases[i]!.t0) {
      phase = phases[i]!;
      break;
    }
  }
  const localT = t - phase.t0;
  if (phase.v0 === 0) {
    return Math.max(landY, phase.y0 + 0.5 * g * localT * localT);
  }
  return Math.max(landY, landY + phase.v0 * localT + 0.5 * g * localT * localT);
}

/** Ease-out for squash recovery after impact. */
function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

/** Stagger window so restored balls don't all release at once. */
const RESTORE_STAGGER_MAX_MS = 520;

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
  const finishRestoreBall = useGameStore((s) => s.finishRestoreBall);
  const restoreStartedAt = useGameStore((s) => s.restoreStartedAt);
  const meshRef = useRef<Mesh>(null);
  const finished = useRef(false);
  const released = useRef(false);
  const fallStartedAt = useRef(0);
  const bornAt = useRef(performance.now());
  const spawnY = dropSpawnY(dims, spacing);
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const g = DROP_GRAVITY[1];
  const plan = useMemo(() => buildDropPhases(spawnY, ty, g), [spawnY, ty, g]);
  const color = useMemo(() => new Color(PLAYER_COLORS[entry.player]), [entry.player]);
  const baseEmissive = 0.28;
  const delayMs = entry.delayMs;
  const isRestore = restoreStartedAt != null;

  useEffect(() => {
    // Restore uses an absolute store clock — don't reset on Strict remount.
    if (isRestore) {
      finished.current = false;
      released.current = false;
      return;
    }
    finished.current = false;
    released.current = delayMs <= 0;
    bornAt.current = performance.now();
    fallStartedAt.current = bornAt.current;
    if (meshRef.current) {
      meshRef.current.position.set(tx, spawnY, tz);
      meshRef.current.scale.set(1, 1, 1);
      meshRef.current.visible = delayMs <= 0;
    }
  }, [tx, spawnY, tz, entry.key, delayMs, isRestore]);

  useFrame(() => {
    if (finished.current || !meshRef.current) return;
    const mesh = meshRef.current;
    const mat = mesh.material as MeshStandardMaterial;
    const now = performance.now();

    let t: number;
    if (isRestore && restoreStartedAt != null) {
      const elapsed = now - restoreStartedAt;
      if (elapsed < delayMs) {
        mesh.visible = false;
        return;
      }
      if (!released.current) {
        released.current = true;
        mesh.visible = true;
      }
      t = (elapsed - delayMs) / 1000;
    } else {
      if (!released.current) {
        if (now - bornAt.current < delayMs) {
          mesh.visible = false;
          return;
        }
        released.current = true;
        fallStartedAt.current = now;
        mesh.visible = true;
        mesh.position.set(tx, spawnY, tz);
        mesh.scale.set(1, 1, 1);
      }
      t = (now - fallStartedAt.current) / 1000;
    }

    if (t >= plan.totalDuration) {
      finished.current = true;
      mesh.visible = true;
      mesh.position.set(tx, ty, tz);
      mesh.scale.set(1, 1, 1);
      mat.emissiveIntensity = baseEmissive;
      if (isRestore) {
        finishRestoreBall(entry.key);
      } else {
        finishDrop();
      }
      return;
    }

    mesh.visible = true;
    const y = sampleDropY(plan.phases, ty, g, t);
    mesh.position.set(tx, y, tz);

    // —— Juice: stretch while falling, squash on impact, recover on bounce ——
    const impactBoost = Math.min(1.35, 0.75 + plan.impactSpeed / 22);
    if (t < plan.fallEnd) {
      // Speed up → more stretch (anticipation of the hit).
      const fallProgress = plan.fallEnd > 0 ? t / plan.fallEnd : 1;
      const stretch = 1 + (STRETCH - 1) * fallProgress * fallProgress;
      mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      mat.emissiveIntensity = baseEmissive;
    } else {
      const sinceHit = t - plan.fallEnd;
      const recover = 0.22;
      const u = Math.min(1, sinceHit / recover);
      const e = easeOutCubic(u);
      // Impact squash peaks immediately, then springs back through a slight overshoot.
      const squashY = SQUASH + (1.06 - SQUASH) * e;
      const squashXZ = 1 / Math.sqrt(squashY);
      // Heavier impacts squash a bit more.
      const yScale = 1 + (squashY - 1) * impactBoost;
      const xzScale = 1 + (squashXZ - 1) * impactBoost;
      mesh.scale.set(xzScale, yScale, xzScale);
      mat.emissiveIntensity = baseEmissive + IMPACT_FLASH * (1 - e) * impactBoost;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[tx, spawnY, tz]}
      castShadow={false}
      visible={!isRestore && delayMs <= 0}
    >
      <sphereGeometry args={[MARKER_RADIUS, 24, 18]} />
      <meshStandardMaterial
        color={color}
        roughness={0.26}
        metalness={0.22}
        emissive={color}
        emissiveIntensity={baseEmissive}
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
  const meshRef = useRef<Mesh>(null);
  const [tx, ty, tz] = cellToWorld(entry.coord, dims, spacing);
  const colorHex = entry.winning ? WIN_COLOR : PLAYER_COLORS[entry.player];
  const color = useMemo(() => new Color(colorHex), [colorHex]);
  const scale = entry.winning ? WIN_SCALE : 1;
  const visualR = MARKER_RADIUS * scale;
  const collidersR = physicsRadius(spacing) * scale;

  useFrame(({ clock }) => {
    if (!entry.winningMove || !meshRef.current) return;
    const bob = Math.sin(clock.elapsedTime * WIN_BOUNCE_HZ * Math.PI * 2) * WIN_BOUNCE_AMP;
    meshRef.current.position.y = bob;
  });

  return (
    <RigidBody type="fixed" position={[tx, ty, tz]} colliders={false} ccd>
      <BallCollider args={[collidersR]} restitution={0} friction={DROP_FRICTION} density={1} />
      <mesh ref={meshRef} castShadow={false}>
        <sphereGeometry args={[visualR, 24, 18]} />
        <meshStandardMaterial
          color={color}
          roughness={0.26}
          metalness={0.22}
          emissive={color}
          emissiveIntensity={entry.winning ? 0.45 : 0.22}
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
  const winningCell = useGameStore((s) => s.winningCell);
  const fallingKey = useGameStore((s) => s.fallingKey);
  const restoreFallingKeys = useGameStore((s) => s.restoreFallingKeys);

  const winSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of winningLine) set.add(cellKey(c.x, c.y, c.z));
    return set;
  }, [winningLine]);

  const winningMoveKey = winningCell
    ? cellKey(winningCell.x, winningCell.y, winningCell.z)
    : null;

  const restoreDelayByKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!restoreFallingKeys || restoreFallingKeys.length === 0) return map;
    const n = restoreFallingKeys.length;
    const step = n <= 1 ? 0 : RESTORE_STAGGER_MAX_MS / (n - 1);
    restoreFallingKeys.forEach((key, i) => {
      map.set(key, i * step);
    });
    return map;
  }, [restoreFallingKeys]);

  const entries = useMemo(() => {
    const list: MarkerEntry[] = [];
    const restoreSet = restoreFallingKeys ? new Set(restoreFallingKeys) : null;
    for (const [key, player] of board) {
      const restoreDelay = restoreDelayByKey.get(key);
      const restoring = restoreSet?.has(key) ?? false;
      list.push({
        key,
        coord: parseCellKey(key),
        player,
        winning: winSet.has(key),
        winningMove: key === winningMoveKey,
        falling: key === fallingKey || restoring,
        delayMs: restoreDelay ?? 0,
      });
    }
    return list;
  }, [board, winSet, winningMoveKey, fallingKey, restoreFallingKeys, restoreDelayByKey]);

  return (
    <>
      {entries.map((entry) => (
        <MarkerBody key={entry.key} entry={entry} dims={dims} spacing={spacing} />
      ))}
    </>
  );
}
