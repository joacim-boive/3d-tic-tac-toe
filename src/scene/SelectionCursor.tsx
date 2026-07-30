"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoxGeometry, EdgesGeometry, Raycaster, Vector2, Vector3 } from "three";
import { cellKey, cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims } from "@/game/types";
import { pickCellAlongRay } from "./pickCellAlongRay";

type SelectionCursorProps = {
  dims: BoardDims;
  spacing?: number;
};

const DRAG_PX = 10;

function isTouchPointer(type: string): boolean {
  return type === "touch" || type === "pen";
}

/**
 * Always-visible aim cursor.
 * Desktop: Shift + move aims (orbit paused); click / Space places.
 * Touch: one-finger drag aims (preview); two-finger orbits / pinches; Place commits.
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

  const [touchAiming, setTouchAiming] = useState(false);
  const showAim = aiming || touchAiming;

  const raycaster = useMemo(() => new Raycaster(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const point = useMemo(() => new Vector3(), []);
  const center = useMemo(() => new Vector3(), []);
  const dragRef = useRef({
    active: false,
    moved: false,
    touchAim: false,
    x: 0,
    y: 0,
  });
  const pointersRef = useRef(new Set<number>());

  const cellSize = spacing * 0.96;
  const edges = useMemo(() => {
    const box = new BoxGeometry(cellSize, cellSize, cellSize);
    const geo = new EdgesGeometry(box);
    box.dispose();
    return geo;
  }, [cellSize]);

  // Desktop Shift-aim: follow pointer each frame (orbit paused via store.aiming).
  useFrame((state) => {
    if (!aiming || status !== "playing") return;

    ndc.copy(state.pointer);
    raycaster.setFromCamera(ndc, camera);
    const hit = pickCellAlongRay({
      origin: raycaster.ray.origin,
      dir: raycaster.ray.direction,
      dims,
      spacing,
      point,
      center,
    });
    if (!hit) return;
    if (hit.x !== cursor.x || hit.y !== cursor.y || hit.z !== cursor.z) {
      setCursor(hit);
    }
  });

  useEffect(() => {
    const el = gl.domElement;

    const clientToCell = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return pickCellAlongRay({
        origin: raycaster.ray.origin,
        dir: raycaster.ray.direction,
        dims,
        spacing,
        point,
        center,
      });
    };

    const aimAt = (clientX: number, clientY: number) => {
      if (status !== "playing") return;
      const cell = clientToCell(clientX, clientY);
      if (cell) setCursor(cell);
    };

    const onDown = (e: PointerEvent) => {
      pointersRef.current.add(e.pointerId);
      const touch = isTouchPointer(e.pointerType);
      const multi = pointersRef.current.size > 1;

      dragRef.current = {
        active: true,
        moved: false,
        touchAim: touch && !multi,
        x: e.clientX,
        y: e.clientY,
      };

      if (touch && multi) {
        dragRef.current.touchAim = false;
        setTouchAiming(false);
        return;
      }

      if (touch) {
        setTouchAiming(true);
        aimAt(e.clientX, e.clientY);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) dragRef.current.moved = true;

      if (dragRef.current.touchAim && pointersRef.current.size === 1) {
        aimAt(e.clientX, e.clientY);
      }
    };

    const onUp = (e: PointerEvent) => {
      const { active, moved, touchAim } = dragRef.current;
      pointersRef.current.delete(e.pointerId);

      if (pointersRef.current.size === 0) {
        dragRef.current.active = false;
        dragRef.current.touchAim = false;
        setTouchAiming(false);
      }

      // Touch never auto-places — Place button commits after preview.
      if (!active || moved || touchAim) return;
      if (status !== "playing") return;
      if (!isTouchPointer(e.pointerType)) placeAtCursor();
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
  }, [
    gl,
    camera,
    dims,
    spacing,
    placeAtCursor,
    setCursor,
    status,
    raycaster,
    ndc,
    point,
    center,
  ]);

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
          opacity={occupied ? 0.2 : showAim ? 0.85 : 0.55}
          emissive={color}
          emissiveIntensity={showAim ? 0.45 : 0.2}
          depthWrite={false}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}
