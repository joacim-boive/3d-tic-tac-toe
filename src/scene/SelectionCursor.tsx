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
/** Wait for a second finger before treating touch as aim (orbit/pinch start). */
const MULTI_WAIT_MS = 120;

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
  const placement = useGameStore((s) => s.placement);
  const dropBusy = useGameStore((s) => s.dropBusy);

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
    /** True once this gesture saw 2+ pointers — never aim/place until all up. */
    multi: false,
    x: 0,
    y: 0,
  });
  const pointersRef = useRef(new Set<number>());
  const aimDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAimRef = useRef({ x: 0, y: 0 });
  // Keep place-lock out of the listener effect deps — rebinding mid-drop orphans
  // touch ids (missed pointerup) and makes one-finger aim look hung.
  const dropBusyRef = useRef(dropBusy);
  dropBusyRef.current = dropBusy;

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
    if (status !== "playing") {
      setTouchAiming(false);
      return;
    }

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

    const clearAimDelay = () => {
      if (aimDelayRef.current === null) return;
      clearTimeout(aimDelayRef.current);
      aimDelayRef.current = null;
    };

    const resetGestureState = () => {
      clearAimDelay();
      pointersRef.current.clear();
      dragRef.current = {
        active: false,
        moved: false,
        touchAim: false,
        multi: false,
        x: 0,
        y: 0,
      };
      setTouchAiming(false);
    };

    const beginTouchAim = () => {
      if (dragRef.current.multi || pointersRef.current.size !== 1) return;
      dragRef.current.touchAim = true;
      setTouchAiming(true);
      aimAt(pendingAimRef.current.x, pendingAimRef.current.y);
    };

    const onDown = (e: PointerEvent) => {
      // Recover from missed pointerup/cancel (listener rebind mid-gesture, Safari quirks).
      // Primary contact starting fresh while orphans linger would otherwise look like multi-touch.
      if (e.isPrimary && pointersRef.current.size > 0 && !pointersRef.current.has(e.pointerId)) {
        resetGestureState();
      }

      pointersRef.current.add(e.pointerId);
      const touch = isTouchPointer(e.pointerType);
      const count = pointersRef.current.size;

      if (count > 1) {
        // Second finger arrived — this is orbit/pinch, not aim.
        clearAimDelay();
        dragRef.current.multi = true;
        dragRef.current.touchAim = false;
        dragRef.current.moved = true;
        setTouchAiming(false);
        return;
      }

      dragRef.current = {
        active: true,
        moved: false,
        touchAim: false,
        multi: false,
        x: e.clientX,
        y: e.clientY,
      };
      pendingAimRef.current = { x: e.clientX, y: e.clientY };

      if (!touch) return;

      // Defer aim so a quick second finger can claim the gesture as orbit.
      clearAimDelay();
      aimDelayRef.current = setTimeout(() => {
        aimDelayRef.current = null;
        beginTouchAim();
      }, MULTI_WAIT_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      pendingAimRef.current = { x: e.clientX, y: e.clientY };

      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      const pastDrag = dx * dx + dy * dy > DRAG_PX * DRAG_PX;
      if (pastDrag) dragRef.current.moved = true;

      // One-finger drag past threshold → commit to aim early (won't become orbit).
      if (
        pastDrag &&
        aimDelayRef.current !== null &&
        pointersRef.current.size === 1 &&
        !dragRef.current.multi
      ) {
        clearAimDelay();
        beginTouchAim();
      }

      if (dragRef.current.touchAim && pointersRef.current.size === 1 && !dragRef.current.multi) {
        aimAt(e.clientX, e.clientY);
      }
    };

    const onUp = (e: PointerEvent) => {
      const { active, moved, touchAim, multi } = dragRef.current;
      const touch = isTouchPointer(e.pointerType);
      pointersRef.current.delete(e.pointerId);

      if (pointersRef.current.size === 0) {
        // Quick tap lifted before MULTI_WAIT_MS — still aim, never place.
        const pendingAim = aimDelayRef.current !== null;
        clearAimDelay();
        if (touch && active && !multi && !touchAim && pendingAim) {
          aimAt(pendingAimRef.current.x, pendingAimRef.current.y);
        }
        dragRef.current.active = false;
        dragRef.current.touchAim = false;
        dragRef.current.multi = false;
        setTouchAiming(false);
      }

      // Touch never auto-places — Place button commits after preview.
      // Multi-touch orbit must not place even if pointerType is misreported.
      if (!active || moved || touchAim || multi) return;
      if (status !== "playing" || dropBusyRef.current) return;
      if (!touch) placeAtCursor();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      resetGestureState();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl, camera, dims, spacing, placeAtCursor, setCursor, status, raycaster, ndc, point, center]);

  if (status !== "playing") return null;

  const occupied = board.has(cellKey(cursor.x, cursor.y, cursor.z));
  const [cx, cy, cz] = cellToWorld(cursor, dims, spacing);
  const color = PLAYER_COLORS[currentPlayer];
  // Drop mode: highlight the whole column shaft lightly, cursor at landing cell.
  const columnH = placement === "drop" ? dims.y * spacing * 0.96 : cellSize;
  const columnY = placement === "drop" ? -cy : 0;

  return (
    <group position={[cx, cy, cz]}>
      {placement === "drop" ? (
        <mesh position={[0, columnY, 0]}>
          <boxGeometry args={[cellSize * 0.92, columnH, cellSize * 0.92]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={occupied || dropBusy ? 0.04 : 0.1}
            depthWrite={false}
          />
        </mesh>
      ) : null}
      <mesh>
        <boxGeometry args={[cellSize, cellSize, cellSize]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={occupied || dropBusy ? 0.06 : 0.16}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={dropBusy ? 0.25 : 0.95} />
      </lineSegments>
      {/* Hide landing ghost while a piece is falling — otherwise it looks like an instant place. */}
      {!dropBusy ? (
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
      ) : null}
    </group>
  );
}
