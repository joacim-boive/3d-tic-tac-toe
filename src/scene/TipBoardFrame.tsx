"use client";

import { Physics } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import {
  tipDownFromEuler,
  tipEulerByDrag,
  tipRemap,
  type TipEuler,
  type TipRemapEntry,
} from "@/game/tipBoard";
import { PLAYER_COLORS, type BoardDims, type PlayerId } from "@/game/types";
import { BoardColliders, DROP_GRAVITY } from "./BoardColliders";
import { Grid } from "./Grid";
import { Markers } from "./Markers";
import { PhysicsMarkers } from "./PhysicsMarkers";
import { SelectionCursor } from "./SelectionCursor";

const TIP_ANIM_SPEED = 12;
const FALL_DURATION = 0.95;
const DRAG_THRESHOLD = 44;

type TipBoardFrameProps = {
  dims: BoardDims;
  dropMode: boolean;
};

function eulerToQuat(e: TipEuler): Quaternion {
  return new Quaternion().setFromEuler(new Euler(e.x, e.y, e.z, "XYZ"));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Board group that tumbles in tip mode; on confirm, balls fall to the new floor.
 */
export function TipBoardFrame({ dims, dropMode }: TipBoardFrameProps) {
  const groupRef = useRef<Group>(null);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipEuler = useGameStore((s) => s.tipEuler);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const tipTargetEuler = useGameStore((s) => s.tipTargetEuler);
  const setTipTargetEuler = useGameStore((s) => s.setTipTargetEuler);
  const commitTipEuler = useGameStore((s) => s.commitTipEuler);
  const finishTipFall = useGameStore((s) => s.finishTipFall);
  const board = useGameStore((s) => s.board);

  const tipMode = powerUpMode === "tip";
  const displayQuat = useRef(new Quaternion());
  const targetQuat = useRef(new Quaternion());
  const fallT = useRef(0);
  const fallDone = useRef(false);

  const fallEntries = useMemo(() => {
    if (!tipFalling) return [] as TipRemapEntry[];
    return tipRemap(board, dims, tipDownFromEuler(tipEuler));
  }, [tipFalling, tipEuler, board, dims]);

  const fallStarts = useMemo(() => {
    const q = eulerToQuat(tipEuler);
    return fallEntries.map((e) => {
      const [x, y, z] = cellToWorld(e.from, dims);
      return new Vector3(x, y, z).applyQuaternion(q);
    });
  }, [fallEntries, tipEuler, dims]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;

    if (tipFalling) {
      // Hold board upright during fall — markers fly in world space from tipped poses
      displayQuat.current.identity();
      g.quaternion.identity();
      fallT.current = Math.min(1, fallT.current + dt / FALL_DURATION);
      if (fallT.current >= 1 && !fallDone.current) {
        fallDone.current = true;
        finishTipFall();
      }
      return;
    }

    fallT.current = 0;
    fallDone.current = false;
    targetQuat.current.copy(eulerToQuat(tipTargetEuler));
    displayQuat.current.slerp(targetQuat.current, 1 - Math.exp(-TIP_ANIM_SPEED * dt));
    g.quaternion.copy(displayQuat.current);

    if (
      tipMode &&
      displayQuat.current.angleTo(targetQuat.current) < 0.015 &&
      (tipEuler.x !== tipTargetEuler.x ||
        tipEuler.y !== tipTargetEuler.y ||
        tipEuler.z !== tipTargetEuler.z)
    ) {
      commitTipEuler(tipTargetEuler);
    }
  });

  useEffect(() => {
    if (!tipMode && !tipFalling && groupRef.current) {
      groupRef.current.quaternion.identity();
      displayQuat.current.identity();
    }
  }, [tipMode, tipFalling]);

  return (
    <>
      {tipMode && !tipFalling ? (
        <TipDragController
          onTip={(axis, dir) => setTipTargetEuler(tipEulerByDrag(tipTargetEuler, axis, dir))}
        />
      ) : null}

      <group ref={groupRef}>
        <Grid dims={dims} />
        {!tipFalling ? <SelectionCursor dims={dims} /> : null}

        {tipFalling ? (
          <TipFallMarkers
            dims={dims}
            entries={fallEntries}
            starts={fallStarts}
            fallTRef={fallT}
          />
        ) : dropMode ? (
          <Physics gravity={DROP_GRAVITY} colliders={false}>
            <BoardColliders dims={dims} />
            <PhysicsMarkers dims={dims} />
          </Physics>
        ) : (
          <Markers dims={dims} />
        )}
      </group>
    </>
  );
}

function TipDragController({
  onTip,
}: {
  onTip: (axis: "x" | "z", dir: 1 | -1) => void;
}) {
  const { gl } = useThree();
  const start = useRef<{ x: number; y: number } | null>(null);
  const armed = useRef(true);

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
      if (Math.abs(dx) > Math.abs(dy)) {
        onTip("z", dx > 0 ? 1 : -1);
      } else {
        onTip("x", dy > 0 ? 1 : -1);
      }
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
  }, [gl, onTip]);

  return null;
}

const tempObj = new Object3D();

function TipFallMarkers({
  dims,
  entries,
  starts,
  fallTRef,
}: {
  dims: BoardDims;
  entries: TipRemapEntry[];
  starts: Vector3[];
  fallTRef: React.MutableRefObject<number>;
}) {
  const geometry = useMemo(() => new SphereGeometry(0.32, 16, 12), []);
  const meshA = useRef<InstancedMesh>(null);
  const meshB = useRef<InstancedMesh>(null);
  const colorA = useMemo(() => new Color(PLAYER_COLORS.a), []);
  const colorB = useMemo(() => new Color(PLAYER_COLORS.b), []);

  useFrame(() => {
    const t = easeOutCubic(fallTRef.current);
    paintPlayer(meshA.current, "a", entries, starts, dims, t);
    paintPlayer(meshB.current, "b", entries, starts, dims, t);
  });

  return (
    <>
      <FallMesh meshRef={meshA} geometry={geometry} color={colorA} count={entries.length} />
      <FallMesh meshRef={meshB} geometry={geometry} color={colorB} count={entries.length} />
    </>
  );
}

function FallMesh({
  meshRef,
  geometry,
  color,
  count,
}: {
  meshRef: React.RefObject<InstancedMesh | null>;
  geometry: SphereGeometry;
  color: Color;
  count: number;
}) {
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, Math.max(1, count)]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.92}
        roughness={0.28}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={0.28}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function paintPlayer(
  mesh: InstancedMesh | null,
  player: PlayerId,
  entries: TipRemapEntry[],
  starts: Vector3[],
  dims: BoardDims,
  t: number,
) {
  if (!mesh) return;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  let i = 0;
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx]!;
    if (e.player !== player) continue;
    const start = starts[idx]!;
    const [ex, ey, ez] = cellToWorld(e.to, dims);
    // Arc: dip below the lerp for a gravity read
    const x = start.x + (ex - start.x) * t;
    const z = start.z + (ez - start.z) * t;
    const yLin = start.y + (ey - start.y) * t;
    const y = yLin - Math.sin(t * Math.PI) * Math.max(0.4, Math.abs(start.y - ey) * 0.25);
    tempObj.position.set(x, y, z);
    tempObj.scale.setScalar(1);
    tempObj.updateMatrix();
    mesh.setMatrixAt(i, tempObj.matrix);
    i++;
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
}
