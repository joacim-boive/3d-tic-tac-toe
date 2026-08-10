"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Color, type Mesh, type MeshStandardMaterial, Vector3 } from "three";
import { cellToWorld } from "@/game/board";
import { CLEAR_BURST_LIFE_MS, type ClearBurstBall } from "@/game/clearRow";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims, type PlayerId } from "@/game/types";

const CONFETTI_COUNT = 18;
const GRAVITY = -11;
const BALL_POP_MS = 90;
const ACCENTS = ["#ffd166", "#fff4c8", "#ffffff", "#ffe0a3"] as const;

type Flake = {
  id: string;
  color: string;
  pos: Vector3;
  vel: Vector3;
  spin: Vector3;
  scale: Vector3;
  born: number;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildFlakes(
  key: string,
  origin: Vector3,
  player: PlayerId,
  seed: number,
  now: number,
): Flake[] {
  const rng = mulberry32(seed);
  const base = PLAYER_COLORS[player];
  const other = PLAYER_COLORS[player === "a" ? "b" : "a"];
  const palette = [base, base, other, ...ACCENTS];
  const flakes: Flake[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = rng() * Math.PI;
    const speed = 2.8 + rng() * 5.4;
    const dir = new Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.abs(Math.cos(phi)) * 0.5 + 0.55 + rng() * 0.5,
      Math.sin(phi) * Math.sin(theta),
    ).normalize();
    flakes.push({
      id: `${key}-f${i}`,
      color: palette[i % palette.length]!,
      pos: origin
        .clone()
        .add(new Vector3((rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12)),
      vel: dir.multiplyScalar(speed),
      spin: new Vector3((rng() - 0.5) * 18, (rng() - 0.5) * 22, (rng() - 0.5) * 18),
      scale: new Vector3(0.05 + rng() * 0.08, 0.012 + rng() * 0.02, 0.08 + rng() * 0.1),
      born: now,
    });
  }
  return flakes;
}

/**
 * Clear power-up action VFX: each ball on the line pops into confetti, staggered
 * along the axis so everyone sees the wipe happen.
 */
export function ClearConfettiBurst({ dims }: { dims: BoardDims }) {
  const clearBurst = useGameStore((s) => s.clearBurst);
  const finishClearBurst = useGameStore((s) => s.finishClearBurst);
  const clockRef = useRef(0);
  const finishedRef = useRef<number | null>(null);

  useFrame((_, dt) => {
    clockRef.current += dt;
  });

  useEffect(() => {
    finishedRef.current = null;
  }, [clearBurst?.id]);

  useEffect(() => {
    if (!clearBurst) return;
    const lastDelay = clearBurst.balls.reduce((m, b) => Math.max(m, b.delayMs), 0);
    // Finish once the last confetti wave has mostly faded (board/turn apply then).
    const waitMs = lastDelay + CLEAR_BURST_LIFE_MS * 0.72;
    const t = window.setTimeout(() => {
      if (finishedRef.current === clearBurst.id) return;
      finishedRef.current = clearBurst.id;
      finishClearBurst();
    }, waitMs);
    return () => window.clearTimeout(t);
  }, [clearBurst, finishClearBurst]);

  if (!clearBurst) return null;

  return (
    <group>
      {clearBurst.balls.map((ball) => (
        <ClearBallBurst
          key={`${clearBurst.id}-${ball.key}`}
          ball={ball}
          dims={dims}
          burstId={clearBurst.id}
          startedAt={clearBurst.startedAt}
          clockRef={clockRef}
        />
      ))}
    </group>
  );
}

function ClearBallBurst({
  ball,
  dims,
  burstId,
  startedAt,
  clockRef,
}: {
  ball: ClearBurstBall;
  dims: BoardDims;
  burstId: number;
  startedAt: number;
  clockRef: MutableRefObject<number>;
}) {
  const meshRef = useRef<Mesh>(null);
  const [wx, wy, wz] = useMemo(() => cellToWorld(ball.cell, dims), [ball.cell, dims]);
  const color = useMemo(() => new Color(PLAYER_COLORS[ball.player]), [ball.player]);
  const [flakes, setFlakes] = useState<Flake[]>([]);
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    const remaining = Math.max(0, ball.delayMs - (performance.now() - startedAt));
    const t = window.setTimeout(() => {
      const origin = new Vector3(wx, wy, wz);
      const seed = (burstId * 9973) ^ (ball.key.length * 7919) ^ (ball.delayMs * 13);
      setFlakes(buildFlakes(ball.key, origin, ball.player, seed >>> 0, clockRef.current));
      setPopped(true);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [ball, burstId, startedAt, wx, wy, wz, clockRef]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!popped) {
      mesh.visible = true;
      mesh.scale.setScalar(1);
      return;
    }
    const local = performance.now() - startedAt - ball.delayMs;
    if (local < BALL_POP_MS) {
      const t = 1 - local / BALL_POP_MS;
      mesh.visible = true;
      mesh.scale.setScalar(Math.max(0.01, t * 1.15));
    } else {
      mesh.visible = false;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} position={[wx, wy, wz]}>
        <sphereGeometry args={[0.32, 16, 12]} />
        <meshStandardMaterial
          color={color}
          roughness={0.28}
          metalness={0.2}
          emissive={color}
          emissiveIntensity={0.22}
        />
      </mesh>
      {flakes.map((flake) => (
        <ConfettiFlake key={flake.id} flake={flake} clockRef={clockRef} />
      ))}
    </group>
  );
}

function ConfettiFlake({
  flake,
  clockRef,
}: {
  flake: Flake;
  clockRef: MutableRefObject<number>;
}) {
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<MeshStandardMaterial>(null);
  const life = CLEAR_BURST_LIFE_MS / 1000;

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const age = clockRef.current - flake.born;
    if (age > life) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    flake.vel.y += GRAVITY * dt;
    flake.pos.addScaledVector(flake.vel, dt);
    mesh.position.copy(flake.pos);
    mesh.rotation.x += flake.spin.x * dt;
    mesh.rotation.y += flake.spin.y * dt;
    mesh.rotation.z += flake.spin.z * dt;
    const fade = age < life * 0.4 ? 1 : 1 - (age - life * 0.4) / (life * 0.6);
    mesh.scale.set(flake.scale.x, flake.scale.y, flake.scale.z);
    mat.opacity = Math.max(0, fade);
    mat.emissiveIntensity = 0.65 * fade;
  });

  return (
    <mesh ref={meshRef} position={flake.pos.toArray()} scale={flake.scale.toArray()}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        ref={matRef}
        color={flake.color}
        emissive={flake.color}
        emissiveIntensity={0.55}
        metalness={0.08}
        roughness={0.35}
        transparent
        opacity={1}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Keys currently owned by the clear VFX layer (hide from Markers). */
export function useClearBurstKeySet(): Set<string> {
  const clearBurst = useGameStore((s) => s.clearBurst);
  return useMemo(() => {
    const set = new Set<string>();
    if (!clearBurst) return set;
    for (const b of clearBurst.balls) set.add(b.key);
    return set;
  }, [clearBurst]);
}
