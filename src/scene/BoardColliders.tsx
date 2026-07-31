"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import type { BoardDims } from "@/game/types";

type BoardCollidersProps = {
  dims: BoardDims;
  spacing?: number;
};

const WALL = 0.18;
/** Match marker sphere radius used in PhysicsMarkers. */
export const MARKER_RADIUS = 0.32;
export const DROP_RESTITUTION = 0.55;
export const DROP_FRICTION = 0.4;

/**
 * Invisible box: floor + four walls, open top.
 * Floor height matches bottom-cell centers minus marker radius so stacks sit on-grid.
 * Ready for future tilt power-ups (rotate this group / change gravity).
 */
export function BoardColliders({ dims, spacing = 1 }: BoardCollidersProps) {
  const w = dims.x * spacing;
  const h = dims.y * spacing;
  const d = dims.z * spacing;
  const halfW = w / 2;
  const halfH = h / 2;
  const halfD = d / 2;
  // Top of floor under the y=0 cell centers.
  const floorTop = -((dims.y - 1) * spacing) / 2 - MARKER_RADIUS;
  const floorCenterY = floorTop - WALL / 2;

  return (
    <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
      {/* Floor */}
      <CuboidCollider
        args={[halfW + WALL, WALL / 2, halfD + WALL]}
        position={[0, floorCenterY, 0]}
        restitution={DROP_RESTITUTION}
        friction={DROP_FRICTION}
      />
      {/* +X / −X walls */}
      <CuboidCollider
        args={[WALL / 2, halfH + WALL, halfD + WALL]}
        position={[halfW + WALL / 2, 0, 0]}
        restitution={0.08}
        friction={DROP_FRICTION}
      />
      <CuboidCollider
        args={[WALL / 2, halfH + WALL, halfD + WALL]}
        position={[-halfW - WALL / 2, 0, 0]}
        restitution={0.08}
        friction={DROP_FRICTION}
      />
      {/* +Z / −Z walls */}
      <CuboidCollider
        args={[halfW + WALL, halfH + WALL, WALL / 2]}
        position={[0, 0, halfD + WALL / 2]}
        restitution={0.08}
        friction={DROP_FRICTION}
      />
      <CuboidCollider
        args={[halfW + WALL, halfH + WALL, WALL / 2]}
        position={[0, 0, -halfD - WALL / 2]}
        restitution={0.08}
        friction={DROP_FRICTION}
      />
    </RigidBody>
  );
}

/** World Y above the board where new drops spawn. */
export function dropSpawnY(dims: BoardDims, spacing = 1): number {
  return (dims.y * spacing) / 2 + spacing * 1.35;
}
