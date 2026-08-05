"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Color, type Group, type Mesh, type MeshStandardMaterial, Vector3 } from "three";
import { SWARM_DURATION_MS, type SwarmPackagePlan, type SwarmTapOutcome } from "@/game/powerUps";
import {
  createEmptySwarmFlyFrame,
  packageWorldPos,
  swarmFlyFrameFromCamera,
  type SwarmFlyFrame,
} from "@/game/swarmMath";
import { useGameStore } from "@/game/store";
import type { BoardDims, PlayerId } from "@/game/types";

/** Bright capsule colors — one per package slot. */
const PACKAGE_COLORS = ["#ff4d6d", "#ffd166", "#3ecfc8"] as const;

/** Visual cylinder size (25% smaller than the first 3D ship). */
const PKG_RADIUS = 0.24;
const PKG_HEIGHT = 0.465;
const PKG_CAP_RADIUS = 0.2475;
const PKG_CAP_HEIGHT = 0.03;
const PKG_CAP_Y = 0.2325;
const PKG_HIT_RADIUS = 0.435;
const PKG_HIT_HEIGHT = 0.7125;

const SHARD_COUNT: Record<SwarmTapOutcome, number> = {
  claim: 22,
  deny: 16,
  dud: 12,
};

const SHARD_LIFE = 1.15;
const GRAVITY = -14;

type SwarmPackagesProps = {
  dims: BoardDims;
};

type BurstShard = {
  id: string;
  color: string;
  pos: Vector3;
  vel: Vector3;
  spin: Vector3;
  scale: Vector3;
  born: number;
};

type Burst = {
  key: string;
  shards: BurstShard[];
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

function sampleFlight(
  pkg: SwarmPackagePlan,
  nowMs: number,
  startMs: number,
  out: Vector3,
  frame: SwarmFlyFrame,
): { pos: Vector3; visible: boolean; t: number } {
  const duration = SWARM_DURATION_MS * pkg.speed;
  const local = nowMs - startMs - pkg.delayMs;
  if (local < 0) return { pos: out, visible: false, t: 0 };
  const t = Math.min(1, local / duration);
  const u = pkg.x0 + (pkg.x1 - pkg.x0) * t;
  const v = pkg.y0 + (pkg.y1 - pkg.y0) * t;
  packageWorldPos(u, v, frame, out);
  return { pos: out, visible: t < 1 || local < duration + 40, t };
}

function outcomeSeed(swarmSeed: number, pkgId: number, outcome: SwarmTapOutcome): number {
  const tag = outcome === "claim" ? 1 : outcome === "deny" ? 2 : 3;
  return (swarmSeed ^ (pkgId * 9973) ^ (tag * 7919)) >>> 0;
}

function buildBurst(
  key: string,
  origin: Vector3,
  color: string,
  outcome: SwarmTapOutcome,
  swarmSeed: number,
  pkgId: number,
  now: number,
): Burst {
  const rng = mulberry32(outcomeSeed(swarmSeed, pkgId, outcome));
  const n = SHARD_COUNT[outcome];
  const boost = outcome === "claim" ? 1.55 : outcome === "deny" ? 1.2 : 0.95;
  const shards: BurstShard[] = [];
  for (let i = 0; i < n; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = rng() * Math.PI;
    const speed = (3.4 + rng() * 6.2) * boost;
    const dir = new Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.abs(Math.cos(phi)) * 0.55 + 0.45 + rng() * 0.55,
      Math.sin(phi) * Math.sin(theta),
    ).normalize();
    shards.push({
      id: `${key}-${i}`,
      color,
      pos: origin
        .clone()
        .add(new Vector3((rng() - 0.5) * 0.14, (rng() - 0.5) * 0.14, (rng() - 0.5) * 0.14)),
      vel: dir.multiplyScalar(speed),
      spin: new Vector3((rng() - 0.5) * 22, (rng() - 0.5) * 22, (rng() - 0.5) * 22),
      scale: new Vector3(0.09 + rng() * 0.14, 0.05 + rng() * 0.1, 0.07 + rng() * 0.12),
      born: now,
    });
  }
  return { key, shards, born: now };
}

/**
 * 3D power-up flyby: bright cylinders streak across the player's viewport.
 * Paths track the live camera frustum so zoom never puts packages out of reach.
 * Catch / dud / deny shatters them into kinematic glass shards (no Rapier).
 */
export function SwarmPackages({ dims }: SwarmPackagesProps) {
  const { camera } = useThree();
  const swarm = useGameStore((s) => s.swarm);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const swarmPopped = useGameStore((s) => s.swarmPopped);
  const playMode = useGameStore((s) => s.playMode);
  const seat = useGameStore((s) => s.seat);
  const catchSwarmPackage = useGameStore((s) => s.catchSwarmPackage);

  const startMsRef = useRef(0);
  const swarmSeedRef = useRef(0);
  const positionsRef = useRef(new Map<number, Vector3>());
  const colorsRef = useRef(new Map<number, string>());
  const handledPopsRef = useRef(new Set<string>());
  const frameRef = useRef(createEmptySwarmFlyFrame());
  const [bursts, setBursts] = useState<Burst[]>([]);
  const clockRef = useRef(0);

  useFrame((_, dt) => {
    clockRef.current += dt;
    swarmFlyFrameFromCamera(camera, dims, frameRef.current);
  });

  // New swarm → reset flight clock + pop tracking.
  useEffect(() => {
    if (!swarm) return;
    startMsRef.current = performance.now();
    swarmSeedRef.current = swarm.seed;
    positionsRef.current = new Map();
    colorsRef.current = new Map();
    handledPopsRef.current = new Set();
    for (const pkg of swarm.packages) {
      colorsRef.current.set(pkg.id, PACKAGE_COLORS[pkg.id % PACKAGE_COLORS.length]!);
    }
  }, [swarm?.seed, swarm]);

  // Spawn shatter for remote / AI-timeout pops (local taps also call spawnPopBurst).
  useEffect(() => {
    const entries = Object.entries(swarmPopped);
    if (entries.length === 0) return;
    const seed = swarmSeedRef.current;
    const now = clockRef.current;
    const next: Burst[] = [];
    for (const [idStr, outcome] of entries) {
      const id = Number(idStr);
      const handleKey = `${seed}:${id}:${outcome}`;
      if (handledPopsRef.current.has(handleKey)) continue;
      const origin =
        positionsRef.current.get(id) ?? packageWorldPos(0.5, 0.5, frameRef.current);
      handledPopsRef.current.add(handleKey);
      const color = colorsRef.current.get(id) ?? PACKAGE_COLORS[0]!;
      next.push(buildBurst(handleKey, origin, color, outcome, seed, id, now));
    }
    if (next.length > 0) {
      setBursts((prev) => [...prev.filter((b) => clockRef.current - b.born < SHARD_LIFE), ...next]);
    }
  }, [swarmPopped, swarm]);

  useEffect(() => {
    if (bursts.length === 0) return;
    const t = window.setInterval(() => {
      setBursts((prev) => prev.filter((b) => clockRef.current - b.born < SHARD_LIFE));
    }, 200);
    return () => window.clearInterval(t);
  }, [bursts.length]);

  const canCatch = playMode === "ai" || (playMode === "online" && seat != null);
  const catcher: PlayerId = playMode === "online" && seat != null ? seat : "a";
  const active = Boolean(swarm && swarmBusy && playMode !== "hotseat");

  const spawnPopBurst = (
    pkgId: number,
    origin: Vector3,
    color: string,
    outcome: SwarmTapOutcome,
  ) => {
    const seed = swarmSeedRef.current;
    const handleKey = `${seed}:${pkgId}:${outcome}`;
    if (handledPopsRef.current.has(handleKey)) return;
    handledPopsRef.current.add(handleKey);
    const burst = buildBurst(handleKey, origin, color, outcome, seed, pkgId, clockRef.current);
    setBursts((prev) => [...prev.filter((b) => clockRef.current - b.born < SHARD_LIFE), burst]);
  };

  return (
    <>
      {active && swarm
        ? swarm.packages.map((pkg) => (
            <FlyingCylinder
              key={`${swarm.seed}-${pkg.id}`}
              pkg={pkg}
              color={PACKAGE_COLORS[pkg.id % PACKAGE_COLORS.length]!}
              startMsRef={startMsRef}
              positionsRef={positionsRef}
              frameRef={frameRef}
              popped={swarmPopped[pkg.id]}
              canCatch={canCatch && !swarmPopped[pkg.id]}
              onCatch={() => {
                const before = scratchPos(pkg.id, positionsRef);
                catchSwarmPackage(pkg.id, catcher);
                const outcome = useGameStore.getState().swarmPopped[pkg.id];
                if (!outcome) return;
                const origin =
                  positionsRef.current.get(pkg.id)?.clone() ??
                  before ??
                  packageWorldPos(0.5, 0.5, frameRef.current);
                spawnPopBurst(
                  pkg.id,
                  origin,
                  PACKAGE_COLORS[pkg.id % PACKAGE_COLORS.length]!,
                  outcome,
                );
              }}
            />
          ))
        : null}

      {bursts.flatMap((burst) =>
        burst.shards.map((shard) => (
          <GlassShard key={shard.id} shard={shard} clockRef={clockRef} />
        )),
      )}
    </>
  );
}

function scratchPos(
  pkgId: number,
  positionsRef: MutableRefObject<Map<number, Vector3>>,
): Vector3 | null {
  const p = positionsRef.current.get(pkgId);
  return p ? p.clone() : null;
}

type FlyingCylinderProps = {
  pkg: SwarmPackagePlan;
  color: string;
  startMsRef: MutableRefObject<number>;
  positionsRef: MutableRefObject<Map<number, Vector3>>;
  frameRef: MutableRefObject<SwarmFlyFrame>;
  popped?: SwarmTapOutcome;
  canCatch: boolean;
  onCatch: () => void;
};

function FlyingCylinder({
  pkg,
  color,
  startMsRef,
  positionsRef,
  frameRef,
  popped,
  canCatch,
  onCatch,
}: FlyingCylinderProps) {
  const groupRef = useRef<Group>(null);
  const matRef = useRef<MeshStandardMaterial>(null);
  const scratch = useRef(new Vector3());
  const baseColor = useMemo(() => new Color(color), [color]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const { pos, visible, t } = sampleFlight(
      pkg,
      performance.now(),
      startMsRef.current,
      scratch.current,
      frameRef.current,
    );
    // Keep last known world pos even after the cylinder leaves — AI timeout
    // shatter reads this when the swarm clears.
    if (t > 0 || visible) {
      let stored = positionsRef.current.get(pkg.id);
      if (!stored) {
        stored = pos.clone();
        positionsRef.current.set(pkg.id, stored);
      } else {
        stored.copy(pos);
      }
    }
    if (popped) {
      group.visible = false;
      return;
    }
    group.visible = visible;
    if (!visible) return;
    group.position.copy(pos);
    group.rotation.x = t * Math.PI * 2.2;
    group.rotation.z = -0.35 + t * 0.9;
    group.rotation.y = t * Math.PI * 1.4;
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.4 + Math.sin(t * Math.PI * 6) * 0.12;
    }
  });

  return (
    <group
      ref={groupRef}
      visible={false}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!canCatch) return;
        // Stamp origin before the store clears the swarm (claim/deny).
        const { pos } = sampleFlight(
          pkg,
          performance.now(),
          startMsRef.current,
          scratch.current,
          frameRef.current,
        );
        let stored = positionsRef.current.get(pkg.id);
        if (!stored) {
          stored = pos.clone();
          positionsRef.current.set(pkg.id, stored);
        } else {
          stored.copy(pos);
        }
        onCatch();
      }}
    >
      {/* Fat invisible hit volume (opacity 0 still raycasts; visible=false does not). */}
      <mesh>
        <cylinderGeometry args={[PKG_HIT_RADIUS, PKG_HIT_RADIUS, PKG_HIT_HEIGHT, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[PKG_RADIUS, PKG_RADIUS, PKG_HEIGHT, 28]} />
        <meshStandardMaterial
          ref={matRef}
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={0.45}
          metalness={0.2}
          roughness={0.22}
        />
      </mesh>
      <mesh position={[0, PKG_CAP_Y, 0]}>
        <cylinderGeometry args={[PKG_CAP_RADIUS, PKG_CAP_RADIUS, PKG_CAP_HEIGHT, 28]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={baseColor}
          emissiveIntensity={0.25}
          metalness={0.35}
          roughness={0.15}
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh position={[0, -PKG_CAP_Y, 0]}>
        <cylinderGeometry args={[PKG_CAP_RADIUS, PKG_CAP_RADIUS, PKG_CAP_HEIGHT, 28]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={baseColor}
          emissiveIntensity={0.25}
          metalness={0.35}
          roughness={0.15}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  );
}

function GlassShard({
  shard,
  clockRef,
}: {
  shard: BurstShard;
  clockRef: MutableRefObject<number>;
}) {
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<MeshStandardMaterial>(null);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const age = clockRef.current - shard.born;
    if (age > SHARD_LIFE) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    shard.vel.y += GRAVITY * dt;
    shard.pos.addScaledVector(shard.vel, dt);
    mesh.position.copy(shard.pos);
    mesh.rotation.x += shard.spin.x * dt;
    mesh.rotation.y += shard.spin.y * dt;
    mesh.rotation.z += shard.spin.z * dt;
    const fade = age < SHARD_LIFE * 0.45 ? 1 : 1 - (age - SHARD_LIFE * 0.45) / (SHARD_LIFE * 0.55);
    const s = 0.75 + fade * 0.35;
    mesh.scale.set(shard.scale.x * s, shard.scale.y * s, shard.scale.z * s);
    mat.opacity = Math.max(0, fade);
    mat.emissiveIntensity = 0.55 * fade;
  });

  return (
    <mesh ref={meshRef} position={shard.pos.toArray()} scale={shard.scale.toArray()}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        ref={matRef}
        color={shard.color}
        emissive={shard.color}
        emissiveIntensity={0.45}
        metalness={0.15}
        roughness={0.12}
        transparent
        opacity={1}
        depthWrite={false}
      />
    </mesh>
  );
}
