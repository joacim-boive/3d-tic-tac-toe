"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import type { BoardDims } from "@/game/types";

type BoardCollidersProps = {
  dims: BoardDims;
  spacing?: number;
};

const WALL = 0.18;
export const MARKER_RADIUS = 0.32;

export function physicsRadius(spacing = 1): number {
  return spacing * 0.48;
}

export const DROP_FRICTION = 0.55;
/**
 * Heavy pull with a readable arc — accelerates over the fall so taller
 * drops hit harder (and get a slightly bigger settle bounce).
 */
export const DROP_GRAVITY: [number, number, number] = [0, -26, 0];

export function BoardColliders({ dims, spacing = 1 }: BoardCollidersProps) {
  const w = dims.x * spacing;
  const h = dims.y * spacing;
  const d = dims.z * spacing;
  const halfW = w / 2;
  const halfH = h / 2;
  const halfD = d / 2;
  const pr = physicsRadius(spacing);
  const floorTop = -((dims.y - 1) * spacing) / 2 - pr;
  const floorCenterY = floorTop - WALL / 2;

  return (
    <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
      <CuboidCollider
        args={[halfW + WALL, WALL / 2, halfD + WALL]}
        position={[0, floorCenterY, 0]}
        restitution={0}
        friction={DROP_FRICTION}
      />
      <CuboidCollider
        args={[WALL / 2, halfH + WALL, halfD + WALL]}
        position={[halfW + WALL / 2, 0, 0]}
        restitution={0}
        friction={DROP_FRICTION}
      />
      <CuboidCollider
        args={[WALL / 2, halfH + WALL, halfD + WALL]}
        position={[-halfW - WALL / 2, 0, 0]}
        restitution={0}
        friction={DROP_FRICTION}
      />
      <CuboidCollider
        args={[halfW + WALL, halfH + WALL, WALL / 2]}
        position={[0, 0, halfD + WALL / 2]}
        restitution={0}
        friction={DROP_FRICTION}
      />
      <CuboidCollider
        args={[halfW + WALL, halfH + WALL, WALL / 2]}
        position={[0, 0, -halfD - WALL / 2]}
        restitution={0}
        friction={DROP_FRICTION}
      />
    </RigidBody>
  );
}

/** High enough to read the fall, low enough to stay snappy (~1s). */
export function dropSpawnY(dims: BoardDims, spacing = 1): number {
  return (dims.y * spacing) / 2 + spacing * 2.15;
}
