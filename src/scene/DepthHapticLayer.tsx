"use client";

import { useEffect, useState } from "react";
import {
  DEPTH_HAPTIC_CELL_ATTR,
  DEPTH_HAPTIC_GRID_ATTR,
  needsSwitchHaptic,
  suppressUnarmedSwitchClick,
} from "./haptic";

const COLS = 6;
const ROWS = 10;
const CELL_COUNT = COLS * ROWS;

const switchAttr = { switch: "" } as const;
const gridAttr = { [DEPTH_HAPTIC_GRID_ATTR]: "" } as const;
const cellAttr = { [DEPTH_HAPTIC_CELL_ATTR]: "" } as const;

/**
 * Tiled native `checkbox switch` controls over the game surface.
 *
 * WebKit only runs switch pointer-tracking (the haptic path that still works
 * after iOS 26.5) when a touchstart has exactly one target touch on that
 * control — so each finger needs its own switch. Programmatic .click() is a
 * no-op for haptics; the depth gesture arms cells under the fingers and flips
 * their direction so the real drag crosses the thumb midpoint.
 */
export function DepthHapticLayer() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(needsSwitchHaptic());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onTouchEnd = (event: TouchEvent) => suppressUnarmedSwitchClick(event);
    window.addEventListener("touchend", onTouchEnd, true);
    window.addEventListener("touchcancel", onTouchEnd, true);
    return () => {
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="depth-haptic-grid" {...gridAttr} aria-hidden>
      {Array.from({ length: CELL_COUNT }, (_, index) => (
        <input
          key={index}
          type="checkbox"
          tabIndex={-1}
          className="depth-haptic-grid__cell"
          autoComplete="off"
          {...switchAttr}
          {...cellAttr}
        />
      ))}
    </div>
  );
}
