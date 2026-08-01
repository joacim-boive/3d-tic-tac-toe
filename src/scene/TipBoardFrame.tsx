"use client";

import { Physics } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Group,
  Quaternion,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
} from "three";
import { cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import { tipRemapFromEuler, type TipRemapEntry } from "@/game/tipBoard";
import { eulerToQuat, tipEulerFromSwipe } from "@/game/tipNav";
import { PLAYER_COLORS, type BoardDims, type PlayerId } from "@/game/types";
import { BoardColliders, DROP_GRAVITY, MARKER_RADIUS } from "./BoardColliders";
import { ClearRowHighlight } from "./ClearRowHighlight";
import { Grid } from "./Grid";
import { Markers } from "./Markers";
import { PhysicsMarkers } from "./PhysicsMarkers";
import { SelectionCursor } from "./SelectionCursor";
import { TipFloorHint } from "./TipFloorHint";

const TIP_ANIM_SPEED = 12;
const DRAG_THRESHOLD = 44;
/** Stagger window so balls don't all release at once. */
const STAGGER_MAX_MS = 520;
/** Match PhysicsMarkers drop settle so tip falls feel the same. */
const BOUNCE_E = 0.24;
const MAX_BOUNCES = 1;
const MAX_DROP_DURATION = 1;
const SQUASH = 0.72;
const STRETCH = 1.14;
const IMPACT_FLASH = 0.7;
const SETTLE_PAD_MS = 80;

type TipBoardFrameProps = {
  dims: BoardDims;
  dropMode: boolean;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type DropPhase = { t0: number; y0: number; v0: number };

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

  // Same punchy single bounce as drop-mode PhysicsMarkers.
  const up = impactSpeed * BOUNCE_E;
  if (up >= 0.7 && MAX_BOUNCES > 0) {
    phases.push({ t0: tCursor, y0: landY, v0: up });
    tCursor += (2 * up) / grav;
  }
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

/**
 * Board group that tumbles in tip mode; after each tip, balls fall to the new floor.
 */
export function TipBoardFrame({ dims, dropMode }: TipBoardFrameProps) {
  const groupRef = useRef<Group>(null);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipEuler = useGameStore((s) => s.tipEuler);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const tipTargetEuler = useGameStore((s) => s.tipTargetEuler);
  const commitTipEuler = useGameStore((s) => s.commitTipEuler);
  const beginTipFall = useGameStore((s) => s.beginTipFall);
  const finishTipFall = useGameStore((s) => s.finishTipFall);
  const board = useGameStore((s) => s.board);
  const watchTipPlayback = useGameStore((s) => s.watchTipPlayback);

  const tipMode = powerUpMode === "tip";
  const tipVisual = tipMode || watchTipPlayback;
  const displayQuat = useRef(new Quaternion());
  const targetQuat = useRef(new Quaternion());

  const fallEntries = useMemo(() => {
    if (!tipFalling) return [] as TipRemapEntry[];
    // Full Euler remap — includes spin-on-bottom yaw, not just which face is down.
    return tipRemapFromEuler(board, dims, tipEuler);
  }, [tipFalling, tipEuler, board, dims]);

  const fallStarts = useMemo(() => {
    const q = eulerToQuat(tipEuler);
    return fallEntries.map((e) => {
      const [x, y, z] = cellToWorld(e.from, dims);
      return new Vector3(x, y, z).applyQuaternion(q);
    });
  }, [fallEntries, tipEuler, dims]);

  const releaseDelays = useMemo(() => {
    if (!tipFalling || fallEntries.length === 0) return [] as number[];
    let seed = (fallEntries.length * 2654435761) >>> 0;
    return fallEntries.map((_, i) => {
      seed = (seed * 1664525 + 1013904223 + i * 97) >>> 0;
      return ((seed % 1000) / 1000) * STAGGER_MAX_MS;
    });
  }, [tipFalling, fallEntries]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;

    if (tipFalling) {
      // Rebase upright so landings match the visible grid floor (world −Y).
      // Balls are drawn in world space from their tipped starts → new cells.
      displayQuat.current.identity();
      targetQuat.current.identity();
      g.quaternion.identity();
      return;
    }

    targetQuat.current.copy(eulerToQuat(tipTargetEuler));
    displayQuat.current.slerp(targetQuat.current, 1 - Math.exp(-TIP_ANIM_SPEED * dt));
    g.quaternion.copy(displayQuat.current);

    if (
      tipVisual &&
      displayQuat.current.angleTo(targetQuat.current) < 0.015 &&
      (tipEuler.x !== tipTargetEuler.x ||
        tipEuler.y !== tipTargetEuler.y ||
        tipEuler.z !== tipTargetEuler.z)
    ) {
      commitTipEuler(tipTargetEuler);
      // Spectator commit playback: after rotate lands, drop the balls.
      if (watchTipPlayback) {
        beginTipFall();
      }
    }
  });

  useEffect(() => {
    if (!tipVisual && !tipFalling && groupRef.current) {
      groupRef.current.quaternion.identity();
      displayQuat.current.identity();
    }
  }, [tipVisual, tipFalling]);

  return (
    <>
      {tipMode && !tipFalling ? <TipDragController /> : null}

      <group ref={groupRef}>
        <Grid dims={dims} />
        {!tipVisual && !tipFalling ? <SelectionCursor dims={dims} /> : null}
        <ClearRowHighlight dims={dims} />
        <TipFloorHint dims={dims} />

        {tipFalling ? null : dropMode ? (
          <Physics gravity={DROP_GRAVITY} colliders={false}>
            <BoardColliders dims={dims} />
            <PhysicsMarkers dims={dims} />
          </Physics>
        ) : (
          <Markers dims={dims} />
        )}
      </group>

      {tipFalling ? (
        <TipFallPhysics
          dims={dims}
          entries={fallEntries}
          starts={fallStarts}
          delaysMs={releaseDelays}
          onAllSettled={finishTipFall}
        />
      ) : null}
    </>
  );
}

function TipDragController() {
  const { gl, camera } = useThree();
  const start = useRef<{ x: number; y: number } | null>(null);
  const armed = useRef(true);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      armed.current = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!start.current || !armed.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      armed.current = false;
      const tipTarget = useGameStore.getState().tipTargetEuler;
      const cam = cameraRef.current;
      const towardCam = new Vector3(cam.position.x, 0, cam.position.z);
      if (towardCam.lengthSq() < 1e-6) towardCam.set(0, 0, 1);
      else towardCam.normalize();
      const camRight = new Vector3(towardCam.z, 0, -towardCam.x);
      const next = tipEulerFromSwipe(tipTarget, camRight, dx, dy);
      useGameStore.getState().setTipTargetEuler(next);
      start.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      start.current = null;
      armed.current = true;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  return null;
}

function TipFallPhysics({
  dims,
  entries,
  starts,
  delaysMs,
  onAllSettled,
}: {
  dims: BoardDims;
  entries: TipRemapEntry[];
  starts: Vector3[];
  delaysMs: number[];
  onAllSettled: () => void;
}) {
  const settled = useRef(0);
  const done = useRef(false);
  const total = entries.length;

  useEffect(() => {
    settled.current = 0;
    done.current = false;
    if (total === 0) {
      onAllSettled();
    }
  }, [total, onAllSettled]);

  const onOneSettled = () => {
    settled.current += 1;
    if (!done.current && settled.current >= total) {
      done.current = true;
      window.setTimeout(onAllSettled, SETTLE_PAD_MS);
    }
  };

  useEffect(() => {
    const maxDelay = delaysMs.length ? Math.max(...delaysMs) : 0;
    const t = window.setTimeout(
      () => {
        if (!done.current) {
          done.current = true;
          onAllSettled();
        }
      },
      maxDelay + 2200,
    );
    return () => window.clearTimeout(t);
  }, [delaysMs, onAllSettled]);

  return (
    <>
      {entries.map((entry, i) => (
        <TipFallingBall
          key={entry.key}
          player={entry.player}
          start={starts[i]!}
          end={cellToWorld(entry.to, dims)}
          delayMs={delaysMs[i] ?? 0}
          onSettled={onOneSettled}
        />
      ))}
    </>
  );
}

function TipFallingBall({
  player,
  start,
  end,
  delayMs,
  onSettled,
}: {
  player: PlayerId;
  start: Vector3;
  end: [number, number, number];
  delayMs: number;
  onSettled: () => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const finished = useRef(false);
  const released = useRef(false);
  const fallStartedAt = useRef(0);
  const bornAt = useRef(performance.now());
  const [ex, ey, ez] = end;
  const g = DROP_GRAVITY[1];
  // Fall from the ball's tipped world height — don't teleport upward first.
  const spawnY = Math.max(start.y, ey + 0.05);
  const plan = useMemo(() => buildDropPhases(spawnY, ey, g), [spawnY, ey, g]);
  const color = useMemo(() => new Color(PLAYER_COLORS[player]), [player]);
  const baseEmissive = 0.28;
  const startX = start.x;
  const startZ = start.z;

  useEffect(() => {
    finished.current = false;
    released.current = false;
    bornAt.current = performance.now();
    if (meshRef.current) {
      meshRef.current.position.set(start.x, start.y, start.z);
      meshRef.current.scale.set(1, 1, 1);
      meshRef.current.visible = true;
    }
  }, [start.x, start.y, start.z]);

  useFrame(() => {
    if (finished.current || !meshRef.current) return;
    const mesh = meshRef.current;
    const mat = mesh.material as MeshStandardMaterial;
    const now = performance.now();

    if (!released.current) {
      if (now - bornAt.current < delayMs) {
        mesh.position.set(start.x, start.y, start.z);
        return;
      }
      released.current = true;
      fallStartedAt.current = now;
      // Continue from current pose (already at start); physics uses spawnY as y0.
      mesh.position.set(startX, spawnY, startZ);
    }

    const t = (now - fallStartedAt.current) / 1000;
    if (t >= plan.totalDuration) {
      finished.current = true;
      mesh.position.set(ex, ey, ez);
      mesh.scale.set(1, 1, 1);
      mat.emissiveIntensity = baseEmissive;
      onSettled();
      return;
    }

    const y = sampleDropY(plan.phases, ey, g, t);
    // Hold column XZ until near the floor, then ease into the packed cell —
    // same vertical-first feel as a normal drop.
    const xzT = plan.fallEnd > 0 ? Math.min(1, t / plan.fallEnd) : 1;
    const xzEase = easeOutCubic(xzT);
    const x = startX + (ex - startX) * xzEase;
    const z = startZ + (ez - startZ) * xzEase;
    mesh.position.set(x, y, z);

    const impactBoost = Math.min(1.35, 0.75 + plan.impactSpeed / 22);
    if (t < plan.fallEnd) {
      const fallProgress = plan.fallEnd > 0 ? t / plan.fallEnd : 1;
      const stretch = 1 + (STRETCH - 1) * fallProgress * fallProgress;
      mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      mat.emissiveIntensity = baseEmissive;
    } else {
      const sinceHit = t - plan.fallEnd;
      const u = Math.min(1, sinceHit / 0.22);
      const ease = easeOutCubic(u);
      const squashY = SQUASH + (1.06 - SQUASH) * ease;
      const squashXZ = 1 / Math.sqrt(squashY);
      const yScale = 1 + (squashY - 1) * impactBoost;
      const xzScale = 1 + (squashXZ - 1) * impactBoost;
      mesh.scale.set(xzScale, yScale, xzScale);
      mat.emissiveIntensity = baseEmissive + IMPACT_FLASH * (1 - ease) * impactBoost;
    }
  });

  return (
    <mesh ref={meshRef} position={[start.x, start.y, start.z]} castShadow={false}>
      <sphereGeometry args={[MARKER_RADIUS, 24, 18]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.94}
        roughness={0.26}
        metalness={0.22}
        emissive={color}
        emissiveIntensity={baseEmissive}
        depthWrite={false}
      />
    </mesh>
  );
}
