"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoxGeometry, EdgesGeometry, Raycaster, Vector2, Vector3 } from "three";
import { cellKey, cellToWorld } from "@/game/board";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, type BoardDims } from "@/game/types";
import type { SliceAxis } from "./facingSliceAxis";
import { deepDirection } from "./facingSliceAxis";
import { pickCellOnDepthPlane } from "./pickCellOnDepthPlane";
import { useSliceHighlightStore } from "./sliceHighlightStore";
import {
  applyWheelDeltaToDepthAccum,
  clampDepthIndex,
  depthStepsFromSwipeDelta,
  pointerCentroidY,
  reconcileStickyDepth,
  stepStickyDepth,
} from "./stickyDepth";

type SelectionCursorProps = {
  dims: BoardDims;
  spacing?: number;
};

const DRAG_PX = 10;
const MULTI_WAIT_MS = 120;
/** 3-finger vertical swipe / trackpad scroll: pixels per depth layer. */
const DEPTH_SWIPE_PX = 48;

function isTouchPointer(type: string): boolean {
  return type === "touch" || type === "pen";
}

type AimSession = {
  axis: SliceAxis;
  depth: number;
  mode: "touch" | "desktop";
};

type TriDepthSession = {
  startY: number;
  startDepth: number;
  axis: SliceAxis;
};

/**
 * Sticky-depth aim cursor.
 * 1-finger / left-drag: pick freely on the sticky plane (including up/down).
 * Touch + fine trackpad with multi-touch: 3-finger swipe = depth.
 * Desktop trackpad: two-finger scroll = orbit; Shift+scroll = depth; pinch = zoom; Q/E = depth.
 * Aim preview is the cell box only (no ghost marker ball). Click/tap moves aim; Space places.
 * Power-ups: swarm blocks pointers; clear-row tap cycles axis (cursor mesh hidden).
 */
export function SelectionCursor({ dims, spacing = 1 }: SelectionCursorProps) {
  const { camera, gl } = useThree();
  const cursor = useGameStore((s) => s.cursor);
  const aiming = useGameStore((s) => s.aiming);
  const status = useGameStore((s) => s.status);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const board = useGameStore((s) => s.board);
  const setCursor = useGameStore((s) => s.setCursor);
  const setAiming = useGameStore((s) => s.setAiming);
  const placement = useGameStore((s) => s.placement);
  const dropBusy = useGameStore((s) => s.dropBusy);
  const occupiedCount = useGameStore((s) => s.occupiedCount);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const cycleClearAxis = useGameStore((s) => s.cycleClearAxis);
  const sticky = useSliceHighlightStore((s) => s.slice);
  const setSticky = useSliceHighlightStore((s) => s.setSlice);
  const clearSticky = useSliceHighlightStore((s) => s.clearSlice);

  const [touchAiming, setTouchAiming] = useState(false);
  const clearMode = powerUpMode === "clear-row";


  const raycaster = useMemo(() => new Raycaster(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const point = useMemo(() => new Vector3(), []);
  const dragRef = useRef({
    active: false,
    moved: false,
    touchAim: false,
    multi: false,
    x: 0,
    y: 0,
  });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const aimDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAimRef = useRef({ x: 0, y: 0 });
  const aimSessionRef = useRef<AimSession | null>(null);
  const triDepthRef = useRef<TriDepthSession | null>(null);
  const dropBusyRef = useRef(dropBusy);
  dropBusyRef.current = dropBusy;
  const swarmBusyRef = useRef(swarmBusy);
  swarmBusyRef.current = swarmBusy;
  const clearModeRef = useRef(clearMode);
  clearModeRef.current = clearMode;
  const cycleClearAxisRef = useRef(cycleClearAxis);
  cycleClearAxisRef.current = cycleClearAxis;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const stickyRef = useRef(sticky);
  stickyRef.current = sticky;

  const cellSize = spacing * 0.96;
  const edges = useMemo(() => {
    const box = new BoxGeometry(cellSize, cellSize, cellSize);
    const geo = new EdgesGeometry(box);
    box.dispose();
    return geo;
  }, [cellSize]);

  const publishSticky = (axis: SliceAxis, depth: number) => {
    const next = { axis, index: clampDepthIndex(depth, axis, dims) };
    setSticky(next);
    stickyRef.current = next;
    return next;
  };

  const ensureSticky = () => {
    const next = reconcileStickyDepth(
      stickyRef.current,
      camera.position,
      dims,
      placementRef.current,
    );
    setSticky(next);
    stickyRef.current = next;
    return next;
  };

  const applyStickyToCursor = (axis: SliceAxis, depth: number) => {
    const cur = cursorRef.current;
    if (cur[axis] === depth) return;
    setCursor({ ...cur, [axis]: depth });
  };

  const pickOnDepth = (clientX: number, clientY: number, axis: SliceAxis, depth: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = pickCellOnDepthPlane({
      origin: raycaster.ray.origin,
      dir: raycaster.ray.direction,
      dims,
      axis,
      depthIndex: depth,
      spacing,
      point,
    });
    if (!hit) return;
    const cur = cursorRef.current;
    if (hit.x !== cur.x || hit.y !== cur.y || hit.z !== cur.z) {
      setCursor(hit);
    }
  };

  const beginAimSession = (mode: "touch" | "desktop"): AimSession => {
    const stickyNow = ensureSticky();
    const session: AimSession = {
      axis: stickyNow.axis,
      depth: stickyNow.index,
      mode,
    };
    aimSessionRef.current = session;
    return session;
  };

  const beginAimSessionRef = useRef(beginAimSession);
  beginAimSessionRef.current = beginAimSession;
  const pickOnDepthRef = useRef(pickOnDepth);
  pickOnDepthRef.current = pickOnDepth;
  const ensureStickyRef = useRef(ensureSticky);
  ensureStickyRef.current = ensureSticky;
  const publishStickyRef = useRef(publishSticky);
  publishStickyRef.current = publishSticky;
  const applyStickyToCursorRef = useRef(applyStickyToCursor);
  applyStickyToCursorRef.current = applyStickyToCursor;

  // Desktop left-drag aim: free 2D pick on sticky plane (up/down moves on-plane).
  useFrame((state) => {
    if (!aiming || status !== "playing" || swarmBusy) {
      if (!touchAiming) aimSessionRef.current = null;
      return;
    }
    if (touchAiming || triDepthRef.current) return;

    let session = aimSessionRef.current;
    if (!session || session.mode !== "desktop") {
      session = beginAimSession("desktop");
    }
    // Keep session depth synced with sticky (Q/E / wheel may have changed it).
    const stickyNow = stickyRef.current;
    if (stickyNow) {
      session.axis = stickyNow.axis;
      session.depth = stickyNow.index;
    }
    ndc.copy(state.pointer);
    raycaster.setFromCamera(ndc, camera);
    const hit = pickCellOnDepthPlane({
      origin: raycaster.ray.origin,
      dir: raycaster.ray.direction,
      dims,
      axis: session.axis,
      depthIndex: session.depth,
      spacing,
      point,
    });
    if (!hit) return;
    if (hit.x !== cursor.x || hit.y !== cursor.y || hit.z !== cursor.z) {
      setCursor(hit);
    }
  });

  // New / empty board → clear sticky depth once (do not clear when aim ends).
  useEffect(() => {
    if (occupiedCount !== 0) return;
    clearSticky();
    stickyRef.current = null;
  }, [occupiedCount, clearSticky]);

  // WASD along the depth axis updates sticky to match.
  useEffect(() => {
    const s = stickyRef.current;
    if (!s) return;
    const along = cursor[s.axis];
    if (along !== s.index) publishStickyRef.current(s.axis, along);
  }, [cursor]);

  // Q/E + Shift+two-finger scroll = depth. Plain scroll orbits in GameCanvas.
  useEffect(() => {
    if (status !== "playing") return;

    let wheelAccum = 0;

    const stepDepth = (deeper: 1 | -1) => {
      if (swarmBusyRef.current) return;
      const stickyNow = ensureStickyRef.current();
      const next = stepStickyDepth(stickyNow, camera.position, dims, deeper);
      publishStickyRef.current(next.axis, next.index);
      if (aimSessionRef.current) aimSessionRef.current.depth = next.index;
      applyStickyToCursorRef.current(next.axis, next.index);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      let deeper: 1 | -1 | 0 = 0;
      if (e.key === "q" || e.key === "Q" || e.key === "[") deeper = -1;
      if (e.key === "e" || e.key === "E" || e.key === "]") deeper = 1;
      if (deeper === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      stepDepth(deeper);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.ctrlKey) return;
      if (swarmBusyRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY === 0) return;
      const { deeperSteps, accum } = applyWheelDeltaToDepthAccum(
        wheelAccum,
        -e.deltaY,
        DEPTH_SWIPE_PX,
      );
      wheelAccum = accum;
      if (deeperSteps === 0) return;
      const dir: 1 | -1 = deeperSteps > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(deeperSteps); i++) stepDepth(dir);
    };

    window.addEventListener("keydown", onKeyDown, true);
    gl.domElement.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      gl.domElement.removeEventListener("wheel", onWheel, true);
    };
  }, [status, camera, dims, gl]);

  useEffect(() => {
    if (status !== "playing") {
      setTouchAiming(false);
      setAiming(false);
      aimSessionRef.current = null;
      triDepthRef.current = null;
      clearSticky();
      return;
    }

    const el = gl.domElement;

    const clearAimDelay = () => {
      if (aimDelayRef.current === null) return;
      clearTimeout(aimDelayRef.current);
      aimDelayRef.current = null;
    };

    const listPointerPoints = () => [...pointersRef.current.values()];

    const endTriDepth = () => {
      triDepthRef.current = null;
    };

    const beginTriDepth = () => {
      const stickyNow = ensureStickyRef.current();
      triDepthRef.current = {
        startY: pointerCentroidY(listPointerPoints()),
        startDepth: stickyNow.index,
        axis: stickyNow.axis,
      };
      // Pause orbit while changing depth.
      setAiming(true);
      setTouchAiming(false);
      aimSessionRef.current = null;
      dragRef.current.touchAim = false;
    };

    const updateTriDepth = () => {
      const session = triDepthRef.current;
      if (!session) return;
      const y = pointerCentroidY(listPointerPoints());
      const steps = depthStepsFromSwipeDelta(y - session.startY, DEPTH_SWIPE_PX);
      const dir = deepDirection(camera.position, session.axis);
      const depth = clampDepthIndex(session.startDepth + steps * dir, session.axis, dims);
      publishStickyRef.current(session.axis, depth);
      applyStickyToCursorRef.current(session.axis, depth);
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
      aimSessionRef.current = null;
      endTriDepth();
      setTouchAiming(false);
      setAiming(false);
    };

    const beginTouchAim = () => {
      if (dragRef.current.multi || pointersRef.current.size !== 1) return;
      if (triDepthRef.current) return;
      if (swarmBusyRef.current) return;
      dragRef.current.touchAim = true;
      setTouchAiming(true);
      setAiming(true);
      const session = beginAimSessionRef.current("touch");
      pickOnDepthRef.current(
        pendingAimRef.current.x,
        pendingAimRef.current.y,
        session.axis,
        session.depth,
      );
    };

    const beginDesktopAim = () => {
      if (dragRef.current.multi || pointersRef.current.size !== 1) return;
      if (swarmBusyRef.current) return;
      dragRef.current.touchAim = true;
      setTouchAiming(false);
      setAiming(true);
      const session = beginAimSessionRef.current("desktop");
      pickOnDepthRef.current(
        pendingAimRef.current.x,
        pendingAimRef.current.y,
        session.axis,
        session.depth,
      );
    };

    const onDown = (e: PointerEvent) => {
      if (swarmBusyRef.current) return;
      const touch = isTouchPointer(e.pointerType);
      // Desktop: only left button aims/places; right-drag orbits via OrbitControls.
      if (!touch && e.button !== 0) return;

      // Recover from missed pointerup/cancel (listener rebind mid-gesture, Safari quirks).
      if (e.isPrimary && pointersRef.current.size > 0 && !pointersRef.current.has(e.pointerId)) {
        resetGestureState();
      }

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const count = pointersRef.current.size;

      if (count >= 3) {
        clearAimDelay();
        dragRef.current.multi = true;
        dragRef.current.touchAim = false;
        dragRef.current.moved = true;
        aimSessionRef.current = null;
        setTouchAiming(false);
        beginTriDepth();
        return;
      }

      if (count === 2) {
        // Two-finger orbit / pinch — yield to OrbitControls.
        clearAimDelay();
        dragRef.current.multi = true;
        dragRef.current.touchAim = false;
        dragRef.current.moved = true;
        aimSessionRef.current = null;
        endTriDepth();
        setTouchAiming(false);
        setAiming(false);
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

      clearAimDelay();
      aimDelayRef.current = setTimeout(() => {
        aimDelayRef.current = null;
        beginTouchAim();
      }, MULTI_WAIT_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pointersRef.current.size >= 3) {
        if (!triDepthRef.current) beginTriDepth();
        updateTriDepth();
        return;
      }

      if (!dragRef.current.active) return;
      pendingAimRef.current = { x: e.clientX, y: e.clientY };

      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      const pastDrag = dx * dx + dy * dy > DRAG_PX * DRAG_PX;
      if (pastDrag) dragRef.current.moved = true;

      const touch = isTouchPointer(e.pointerType);

      if (
        pastDrag &&
        !dragRef.current.touchAim &&
        pointersRef.current.size === 1 &&
        !dragRef.current.multi
      ) {
        if (touch && aimDelayRef.current !== null) {
          clearAimDelay();
          beginTouchAim();
        } else if (!touch) {
          beginDesktopAim();
        }
      }

      if (dragRef.current.touchAim && pointersRef.current.size === 1 && !dragRef.current.multi) {
        const session = aimSessionRef.current;
        if (session) {
          const stickyNow = stickyRef.current;
          if (stickyNow) {
            session.axis = stickyNow.axis;
            session.depth = stickyNow.index;
          }
          pickOnDepthRef.current(e.clientX, e.clientY, session.axis, session.depth);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const { active, moved, touchAim, multi } = dragRef.current;
      const touch = isTouchPointer(e.pointerType);
      pointersRef.current.delete(e.pointerId);
      const remaining = pointersRef.current.size;

      if (remaining >= 3) {
        // Still in tri-depth — refresh anchor so lifting one finger doesn't jump.
        const stickyNow = ensureStickyRef.current();
        triDepthRef.current = {
          startY: pointerCentroidY(listPointerPoints()),
          startDepth: stickyNow.index,
          axis: stickyNow.axis,
        };
        return;
      }

      if (remaining === 2) {
        // Dropped to orbit — hand off to OrbitControls.
        endTriDepth();
        setAiming(false);
        setTouchAiming(false);
        aimSessionRef.current = null;
        dragRef.current.touchAim = false;
        dragRef.current.multi = true;
        return;
      }

      if (remaining === 0) {
        endTriDepth();
        clearAimDelay();
        dragRef.current.active = false;
        dragRef.current.touchAim = false;
        dragRef.current.multi = false;
        aimSessionRef.current = null;
        setTouchAiming(false);
        setAiming(false);
        // Sticky plane stays lit after depth / aim ends.
      } else if (remaining === 1) {
        const wasTri = triDepthRef.current !== null;
        endTriDepth();
        const left = listPointerPoints()[0];
        // After 3-finger depth, keep free aim on the sticky plane with the
        // remaining finger — no need to lift and re-drag.
        if (wasTri && left && touch && !swarmBusyRef.current) {
          dragRef.current = {
            active: true,
            moved: true,
            touchAim: true,
            multi: false,
            x: left.x,
            y: left.y,
          };
          pendingAimRef.current = { x: left.x, y: left.y };
          setTouchAiming(true);
          setAiming(true);
          const session = beginAimSessionRef.current("touch");
          pickOnDepthRef.current(left.x, left.y, session.axis, session.depth);
        } else {
          setAiming(false);
          setTouchAiming(false);
          aimSessionRef.current = null;
          dragRef.current.multi = false;
          dragRef.current.touchAim = false;
        }
      }

      // Clear mode: tap/click cycles axis. Click/tap (no drag) moves aim only — Space places.
      if (!active || moved || touchAim || multi) return;
      if (status !== "playing" || dropBusyRef.current || swarmBusyRef.current) return;
      if (clearModeRef.current) {
        cycleClearAxisRef.current();
        return;
      }
      const stickyNow = ensureStickyRef.current();
      pickOnDepthRef.current(
        pendingAimRef.current.x,
        pendingAimRef.current.y,
        stickyNow.axis,
        stickyNow.index,
      );
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
  }, [
    gl,
    camera,
    dims,
    spacing,
    setCursor,
    setAiming,
    status,
    raycaster,
    ndc,
    point,
    clearSticky,
  ]);

  if (status !== "playing") return null;

  // Clear mode: no place-style cell border — the translucent shaft is the only preview.
  // Gesture listeners above still handle aim + tap-to-cycle.
  if (clearMode) return null;

  const occupied = board.has(cellKey(cursor.x, cursor.y, cursor.z));
  const [cx, cy, cz] = cellToWorld(cursor, dims, spacing);
  const color = PLAYER_COLORS[currentPlayer];
  const columnH = placement === "drop" ? dims.y * spacing * 0.96 : cellSize;
  const columnY = placement === "drop" ? -cy : 0;
  // Occupied cell (e.g. after a settle before snap): never frame a placed ball.
  // During dropBusy the landing cell is already on the board — keep a dim box as the drop target.
  const showCell = !occupied || dropBusy;

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
      {showCell ? (
        <>
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
        </>
      ) : null}
    </group>
  );
}
