"use client";

import { useEffect } from "react";
import { useGameStore } from "@/game/store";

/** Keyboard + Shift aiming for the play session. */
export function useGameControls() {
  const setAiming = useGameStore((s) => s.setAiming);
  const nudgeCursor = useGameStore((s) => s.nudgeCursor);
  const placeAtCursor = useGameStore((s) => s.placeAtCursor);
  const returnToSetup = useGameStore((s) => s.returnToSetup);
  const startGame = useGameStore((s) => s.startGame);
  const status = useGameStore((s) => s.status);
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    if (phase !== "playing") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setAiming(true);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          if (status === "playing") placeAtCursor();
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          nudgeCursor(-1, 0, 0);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          nudgeCursor(1, 0, 0);
          break;
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          nudgeCursor(0, 1, 0);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          nudgeCursor(0, -1, 0);
          break;
        case "q":
        case "Q":
        case "[":
          e.preventDefault();
          nudgeCursor(0, 0, -1);
          break;
        case "e":
        case "E":
        case "]":
          e.preventDefault();
          nudgeCursor(0, 0, 1);
          break;
        case "Escape":
          returnToSetup();
          break;
        case "r":
        case "R":
          if (status === "won" || status === "draw") startGame();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setAiming(false);
    };

    const onBlur = () => setAiming(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setAiming(false);
    };
  }, [phase, status, setAiming, nudgeCursor, placeAtCursor, returnToSetup, startGame]);
}
