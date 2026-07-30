"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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

/**
 * Always-visible aim cursor.
 * Desktop: hold Shift + move to aim (orbit paused); click / Space places.
 * Touch: tap a cell to place there; drag orbits, pinch zooms.
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
  const place = useGameStore((s) => s.place);

  const raycaster = useMemo(() => new Raycaster(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const point = useMemo(() => new Vector3(), []);
  const center = useMemo(() => new Vector3(), []);
  const dragRef = useRef({
    active: false,
    moved: false,
    multi: false,
    x: 0,
    y: 0,
    pointerType: "mouse",
  });
  const pointersRef = useRef(new Set<number>());

  const cellSize = spacing * 0.96;
  const edges = useMemo(() => {
    const box = new BoxGeometry(cellSize, cellSize, cellSize);
    const geo = new EdgesGeometry(box);
    box.dispose();
    return geo;
  }, [cellSize]);

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

    const onDown = (e: PointerEvent) => {
      pointersRef.current.add(e.pointerId);
      const multi = pointersRef.current.size > 1;
      dragRef.current = {
        active: true,
        moved: false,
        multi: dragRef.current.multi || multi,
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType,
      };
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) dragRef.current.moved = true;
    };

    const onUp = (e: PointerEvent) => {
      const { active, moved, multi, pointerType, x, y } = dragRef.current;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size === 0) {
        dragRef.current.active = false;
        dragRef.current.multi = false;
      }
      if (!active || moved || multi) return;
      if (status !== "playing") return;

      const isTouch = pointerType === "touch" || pointerType === "pen";
      if (isTouch) {
        const cell = clientToCell(x, y);
        if (cell) place(cell);
        return;
      }
      placeAtCursor();
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
  }, [gl, camera, dims, spacing, place, placeAtCursor, status, raycaster, ndc, point, center]);

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
