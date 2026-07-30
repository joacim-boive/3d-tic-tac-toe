"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, Raycaster, Vector2, Vector3 } from "three";
import { cellKey, cellToWorld, worldToCell } from "@/game/board";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims } from "@/game/types";

type SelectionCursorProps = {
  dims: BoardDims;
  spacing?: number;
};

/**
 * Always-visible aim cursor. Hold Shift + move pointer to aim (orbit paused).
 * Click (no drag) or Space/Enter places at the cursor.
 */
export function SelectionCursor({ dims, spacing = 1 }: SelectionCursorProps) {
  const { camera, gl } = useThree();
  const cursor = useGameStore((s) => s.cursor);
  const aiming = useGameStore((s) => s.aiming);
  const status = useGameStore((s) => s.status);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const board = useGameStore((s) => s.board);
  const setCursor = useGameStore((s) => s.setCursor);
  const placeAtCursor = useGameStore((s) => s.placeAtCursor);

  const raycaster = useMemo(() => new Raycaster(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const point = useMemo(() => new Vector3(), []);
  const center = useMemo(() => new Vector3(), []);
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0 });

  const cellSize = spacing * 0.96;
  const edges = useMemo(() => {
    const box = new BoxGeometry(cellSize, cellSize, cellSize);
    const geo = new EdgesGeometry(box);
    box.dispose();
    return geo;
  }, [cellSize]);

  const halfX = (dims.x * spacing) / 2 + 0.01;
  const halfY = (dims.y * spacing) / 2 + 0.01;
  const halfZ = (dims.z * spacing) / 2 + 0.01;
  const maxHalf = Math.max(halfX, halfY, halfZ);

  useFrame((state) => {
    if (!aiming || status !== "playing") return;

    ndc.copy(state.pointer);
    raycaster.setFromCamera(ndc, camera);

    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    let best = cursor;
    let bestDist = spacing * 0.65;

    const maxT = maxHalf * 5;
    const step = spacing * 0.25;
    for (let t = 0; t <= maxT; t += step) {
      point.copy(origin).addScaledVector(dir, t);
      if (Math.abs(point.x) > halfX || Math.abs(point.y) > halfY || Math.abs(point.z) > halfZ) {
        continue;
      }
      const cell = worldToCell(point.x, point.y, point.z, dims, spacing);
      if (!cell) continue;
      const [wx, wy, wz] = cellToWorld(cell, dims, spacing);
      center.set(wx, wy, wz);
      const d = point.distanceTo(center);
      if (d < bestDist) {
        bestDist = d;
        best = cell;
      }
    }

    if (best.x !== cursor.x || best.y !== cursor.y || best.z !== cursor.z) {
      setCursor(best);
    }
  });

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      dragRef.current = { active: true, moved: false, x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (dx * dx + dy * dy > 25) dragRef.current.moved = true;
    };
    const onUp = () => {
      const { active, moved } = dragRef.current;
      dragRef.current.active = false;
      if (!active || moved) return;
      if (status !== "playing") return;
      placeAtCursor();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, [gl, placeAtCursor, status]);

  if (status !== "playing") return null;

  const occupied = board.has(cellKey(cursor.x, cursor.y, cursor.z));
  const [cx, cy, cz] = cellToWorld(cursor, dims, spacing);
  const color = PLAYER_COLORS[currentPlayer];

  return (
    <group position={[cx, cy, cz]}>
      <mesh>
        <boxGeometry args={[cellSize, cellSize, cellSize]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={occupied ? 0.06 : 0.16}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={0.95} />
      </lineSegments>
      <mesh>
        <sphereGeometry args={[0.28, 20, 16]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={occupied ? 0.2 : aiming ? 0.85 : 0.55}
          emissive={color}
          emissiveIntensity={aiming ? 0.45 : 0.2}
          depthWrite={false}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}
