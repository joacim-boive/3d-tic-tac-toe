"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getPreset } from "@/game/presets";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS } from "@/game/types";
import { leaveOnlineSession } from "@/online/session";
import { RematchDialog } from "./RematchDialog";
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
  const placement = useGameStore((s) => s.placement);
  const dropBusy = useGameStore((s) => s.dropBusy);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const status = useGameStore((s) => s.status);
  const winner = useGameStore((s) => s.winner);
  const aiming = useGameStore((s) => s.aiming);
  const cursor = useGameStore((s) => s.cursor);
  const seat = useGameStore((s) => s.seat);
  const onlineStatus = useGameStore((s) => s.onlineStatus);
  const playerNames = useGameStore((s) => s.playerNames);
  const rematch = useGameStore((s) => s.rematch);
  const returnToSetup = useGameStore((s) => s.returnToSetup);
  const placeAtCursor = useGameStore((s) => s.placeAtCursor);
  const displayName = useGameStore((s) => s.displayName);

  const preset = getPreset(presetId);
  const turnColor = PLAYER_COLORS[currentPlayer];
  const paused = playMode === "online" && onlineStatus === "paused";
  const myTurn =
    playMode !== "online" || (seat != null && currentPlayer === seat && onlineStatus === "playing");

  let statusText: string;
  if (paused) {
    const other = seat === "a" ? "b" : "a";
    const otherName = playerNames[other].trim() || displayName(other);
    statusText = `Waiting for ${otherName} to reconnect…`;
  } else if (dropBusy) {
    statusText = "Dropping…";
  } else if (status === "won" && winner) {
    statusText = `${displayName(winner)} wins`;
  } else if (status === "draw") {
    statusText = "Draw";
  } else if (playMode === "ai" && currentPlayer === "b") {
    statusText = "Cyan is thinking…";
  } else {
    statusText = placement === "drop" ? `${displayName(currentPlayer)} to drop` : `${displayName(currentPlayer)} to place`;
  }

  const modeLabel = playMode === "ai" ? "vs AI" : playMode === "online" ? "Online" : "Hotseat";
  const placementLabel = placement === "drop" ? "Drop" : "Free";

  const onMenu = () => {
    if (playMode === "online") {
      void leaveOnlineSession();
    } else {
      returnToSetup();
    }
  };

  return (
    <div className="game-shell">
      <header className="chrome chrome--top">
        <div className="chrome__meta">
          <span className="chrome__brand">Voxel Toe</span>
          <span className="chrome__preset">{preset.label}</span>
          <span className="chrome__mode">{modeLabel}</span>
          <span className="chrome__mode">{placementLabel}</span>
        </div>

        <div className="chrome__status" style={{ ["--turn" as string]: turnColor }}>
          <span className="chrome__dot" aria-hidden />
          <span>{statusText}</span>
          {status === "playing" && !paused && (
            <span className="chrome__cell">
              {cursor.x},{cursor.y},{cursor.z}
            </span>
          )}
          {aiming && !paused && <span className="chrome__aim">Aiming</span>}
        </div>

        <div className="chrome__actions">
          {playMode !== "online" && (status === "won" || status === "draw") && (
            <button type="button" className="chrome__btn chrome__btn--accent" onClick={rematch}>
              Rematch
              {!touchUi && (
                <>
                  {" "}
                  <kbd>R</kbd>
                </>
              )}
            </button>
          )}
          {status === "playing" && !paused && myTurn && (
            <button
              type="button"
              className="chrome__btn chrome__btn--accent"
              onClick={placeAtCursor}
              disabled={dropBusy}
            >
              {placement === "drop" ? "Drop" : "Place"}
              {!touchUi && (
                <>
                  {" "}
                  <kbd>Space</kbd>
                </>
              )}
            </button>
          )}
          <button type="button" className="chrome__btn" onClick={onMenu}>
            Menu
            {!touchUi && (
              <>
                {" "}
                <kbd>Esc</kbd>
              </>
            )}
          </button>
        </div>
      </header>

      <div className="game-viewport">{children}</div>

      <RematchDialog />

      <footer className="chrome chrome--bottom">
        <ul className="chrome__hints">
          {status === "won" || status === "draw" ? (
            <>
              <li>
                <kbd>drag</kbd> orbit
              </li>
              <li>
                <kbd>pinch</kbd> zoom
              </li>
            </>
          ) : touchUi ? (
            <>
              <li>
                <kbd>drag</kbd> aim
              </li>
              <li>
                <kbd>3 fingers</kbd> depth
              </li>
              <li>
                <kbd>2 fingers</kbd> orbit
              </li>
              <li>
                <kbd>tap</kbd> on plane
              </li>
              <li>
                <kbd>{placement === "drop" ? "Drop" : "Place"}</kbd> commit
              </li>
            </>
          ) : (
            <>
              <li>
                <kbd>drag</kbd> orbit
              </li>
              <li>
                <kbd>Shift</kbd> + move aim
              </li>
              <li>
                <kbd>Q</kbd>/<kbd>E</kbd> or scroll depth
              </li>
              <li>
                <kbd>WASD</kbd> {placement === "drop" ? "column" : "nudge"}
              </li>
              <li>
                <kbd>Space</kbd> / click {placement === "drop" ? "drop" : "place"}
              </li>
            </>
          )}
        </ul>
      </footer>
    </div>
  );
}
