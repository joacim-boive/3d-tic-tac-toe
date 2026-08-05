"use client";

import { useEffect } from "react";
import { clearFixedFromCursor } from "@/game/clearRow";
import { useGameStore } from "@/game/store";
import { leaveOnlineSession } from "@/online/session";

/** Keyboard play controls (aim is left-drag / touch — see SelectionCursor). */
export function useGameControls() {
  const setAiming = useGameStore((s) => s.setAiming);
  const nudgeCursor = useGameStore((s) => s.nudgeCursor);
  const placeAtCursor = useGameStore((s) => s.placeAtCursor);
  const returnToSetup = useGameStore((s) => s.returnToSetup);
  const rematch = useGameStore((s) => s.rematch);
  const status = useGameStore((s) => s.status);
  const phase = useGameStore((s) => s.phase);
  const playMode = useGameStore((s) => s.playMode);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const tipLocked = powerUpMode === "tip" || tipFalling;
  const clearMode = powerUpMode === "clear-row";
  // Tip: no keyboard play. Clear: only aim / cycle / confirm (not place).
  const playLocked = swarmBusy || tipLocked;
  const confirmClearRow = useGameStore((s) => s.confirmClearRow);
  const confirmTip = useGameStore((s) => s.confirmTip);
  const cancelPowerUpMode = useGameStore((s) => s.cancelPowerUpMode);
  const clearAxis = useGameStore((s) => s.clearAxis);
  const cursor = useGameStore((s) => s.cursor);
  const cycleClearAxis = useGameStore((s) => s.cycleClearAxis);

  useEffect(() => {
    if (phase !== "playing") return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          if (status !== "playing") break;
          if (powerUpMode === "tip" && !tipFalling) {
            confirmTip();
            break;
          }
          if (playLocked) break;
          if (clearMode) {
            const fixed = clearFixedFromCursor(clearAxis, cursor);
            confirmClearRow(fixed.a, fixed.b);
          } else {
            placeAtCursor();
          }
          break;
        case "Tab":
          if (status === "playing" && clearMode && !playLocked) {
            e.preventDefault();
            cycleClearAxis();
          }
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          if (status !== "playing" || playLocked) break;
          e.preventDefault();
          nudgeCursor(-1, 0, 0);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          if (status !== "playing" || playLocked) break;
          e.preventDefault();
          nudgeCursor(1, 0, 0);
          break;
        case "ArrowUp":
        case "w":
        case "W":
          if (status !== "playing" || playLocked) break;
          e.preventDefault();
          nudgeCursor(0, 1, 0);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          if (status !== "playing" || playLocked) break;
          e.preventDefault();
          nudgeCursor(0, -1, 0);
          break;
        case "Escape":
          // Power-up modes: Esc cancels (same as Cancel), not leave to menu.
          if (
            (clearMode || powerUpMode === "tip" || powerUpMode === "extra-turn") &&
            !tipFalling
          ) {
            e.preventDefault();
            cancelPowerUpMode();
            break;
          }
          if (playMode === "online") {
            void leaveOnlineSession();
          } else {
            returnToSetup();
          }
          break;
        case "r":
        case "R":
          if (playMode !== "online" && (status === "won" || status === "draw")) {
            rematch();
          }
          break;
        default:
          break;
      }
    };

    const onBlur = () => setAiming(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      setAiming(false);
    };
  }, [
    phase,
    status,
    playMode,
    playLocked,
    clearMode,
    powerUpMode,
    tipFalling,
    clearAxis,
    cursor,
    setAiming,
    nudgeCursor,
    placeAtCursor,
    confirmClearRow,
    confirmTip,
    cancelPowerUpMode,
    cycleClearAxis,
    returnToSetup,
    rematch,
  ]);
}
