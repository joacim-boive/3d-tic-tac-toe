"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS, PLAYER_LABELS } from "@/game/types";
import { useGameControls } from "./useGameControls";

type GameChromeProps = {
  children: ReactNode;
};

/** Coarse pointer ≈ phone/tablet; fine + hover ≈ mouse/trackpad. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return coarse;
}

export function GameChrome({ children }: GameChromeProps) {
  useGameControls();
  const touchUi = useCoarsePointer();

  const presetId = useGameStore((s) => s.presetId);
  const playMode = useGameStore((s) => s.playMode);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const status = useGameStore((s) => s.status);
  const winner = useGameStore((s) => s.winner);
  const aiming = useGameStore((s) => s.aiming);
  const cursor = useGameStore((s) => s.cursor);
  const startGame = useGameStore((s) => s.startGame);
  const returnToSetup = useGameStore((s) => s.returnToSetup);
  const placeAtCursor = useGameStore((s) => s.placeAtCursor);

  const preset = getPreset(presetId);
  const turnColor = PLAYER_COLORS[currentPlayer];

  let statusText: string;
  if (status === "won" && winner) {
    statusText = `${PLAYER_LABELS[winner]} wins`;
  } else if (status === "draw") {
    statusText = "Draw";
  } else if (playMode === "ai" && currentPlayer === "b") {
    statusText = "Cyan is thinking…";
  } else {
    statusText = `${PLAYER_LABELS[currentPlayer]} to place`;
  }

  return (
    <div className="game-shell">
      <header className="chrome chrome--top">
        <div className="chrome__meta">
          <span className="chrome__brand">Voxel Toe</span>
          <span className="chrome__preset">{preset.label}</span>
          <span className="chrome__mode">{playMode === "ai" ? "vs AI" : "Hotseat"}</span>
        </div>

        <div className="chrome__status" style={{ ["--turn" as string]: turnColor }}>
          <span className="chrome__dot" aria-hidden />
          <span>{statusText}</span>
          {status === "playing" && (
            <span className="chrome__cell">
              {cursor.x},{cursor.y},{cursor.z}
            </span>
          )}
          {aiming && <span className="chrome__aim">Aiming</span>}
        </div>

        <div className="chrome__actions">
          {(status === "won" || status === "draw") && (
            <button type="button" className="chrome__btn chrome__btn--accent" onClick={startGame}>
              Rematch{!touchUi && (
                <>
                  {" "}
                  <kbd>R</kbd>
                </>
              )}
            </button>
          )}
          {status === "playing" && (
            <button
              type="button"
              className="chrome__btn chrome__btn--accent"
              onClick={placeAtCursor}
            >
              Place{!touchUi && (
                <>
                  {" "}
                  <kbd>Space</kbd>
                </>
              )}
            </button>
          )}
          <button type="button" className="chrome__btn" onClick={returnToSetup}>
            Menu{!touchUi && (
              <>
                {" "}
                <kbd>Esc</kbd>
              </>
            )}
          </button>
        </div>
      </header>

      <div className="game-viewport">{children}</div>

      <footer className="chrome chrome--bottom">
        <ul className="chrome__hints">
          {touchUi ? (
            <>
              <li>
                <kbd>drag</kbd> aim
              </li>
              <li>
                <kbd>2 fingers</kbd> orbit
              </li>
              <li>
                <kbd>pinch</kbd> zoom
              </li>
              <li>
                <kbd>Place</kbd> commit
              </li>
            </>
          ) : (
            <>
              <li>
                <kbd>drag</kbd> orbit
              </li>
              <li>
                <kbd>pinch</kbd> zoom
              </li>
              <li>
                <kbd>Shift</kbd> + move aim
              </li>
              <li>
                <kbd>WASD</kbd> nudge
              </li>
              <li>
                <kbd>Q</kbd>/<kbd>E</kbd> depth
              </li>
              <li>
                <kbd>Space</kbd> / click place
              </li>
            </>
          )}
        </ul>
      </footer>
    </div>
  );
}
