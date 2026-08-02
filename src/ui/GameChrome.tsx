"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useGameStore } from "@/game/store";
import { tipDownFromEuler } from "@/game/tipBoard";
import { PLAYER_COLORS } from "@/game/types";
import { leaveOnlineSession } from "@/online/session";
import { RematchDialog } from "./RematchDialog";
import { PackageSwarm } from "./PackageSwarm";
import { PowerUpHud } from "./PowerUpHud";
import { PowerUpToast } from "./PowerUpToast";
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

  const playMode = useGameStore((s) => s.playMode);
  const placement = useGameStore((s) => s.placement);
  const dropBusy = useGameStore((s) => s.dropBusy);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const bonusPlacesRemaining = useGameStore((s) => s.bonusPlacesRemaining);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const watchPowerUp = useGameStore((s) => s.watchPowerUp);
  const watchTipPlayback = useGameStore((s) => s.watchTipPlayback);
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
  const cancelPowerUpMode = useGameStore((s) => s.cancelPowerUpMode);
  const confirmTip = useGameStore((s) => s.confirmTip);
  const tipTargetEuler = useGameStore((s) => s.tipTargetEuler);
  const displayName = useGameStore((s) => s.displayName);

  const turnColor = PLAYER_COLORS[currentPlayer];
  const paused = playMode === "online" && onlineStatus === "paused";
  const myTurn =
    playMode !== "online" || (seat != null && currentPlayer === seat && onlineStatus === "playing");

  let statusText: string;
  if (paused) {
    const other = seat === "a" ? "b" : "a";
    const otherName = playerNames[other].trim() || displayName(other);
    statusText = `Waiting for ${otherName} to reconnect…`;
  } else if (swarmBusy) {
    statusText = "Catch a package — tap a cylinder";
  } else if (dropBusy) {
    statusText = "Dropping…";
  } else if (status === "won" && winner) {
    statusText = `${displayName(winner)} wins`;
  } else if (status === "draw") {
    statusText = "Draw";
  } else if (tipFalling) {
    statusText = "Balls falling…";
  } else if (watchTipPlayback) {
    statusText = playMode === "ai" ? "Cyan tipping…" : "Opponent tipping…";
  } else if (watchPowerUp?.kind === "clear-row") {
    statusText = `${displayName(watchPowerUp.by)} aiming Clear…`;
  } else if (watchPowerUp?.kind === "tip") {
    statusText = `${displayName(watchPowerUp.by)} tipping…`;
  } else if (powerUpMode === "clear-row") {
    statusText = "Clear — aim · tap to switch axis";
  } else if (bonusPlacesRemaining > 0) {
    statusText = `${displayName(currentPlayer)} — extra place`;
  } else if (playMode === "ai" && currentPlayer === "b") {
    statusText = "Cyan is thinking…";
  } else {
    statusText =
      placement === "drop"
        ? `${displayName(currentPlayer)} to drop`
        : `${displayName(currentPlayer)} to place`;
  }

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
          {status === "playing" && !paused && myTurn && powerUpMode === "tip" && !tipFalling ? (
            <>
              <button
                type="button"
                className="chrome__btn chrome__btn--accent"
                disabled={tipDownFromEuler(tipTargetEuler) === "-y"}
                onClick={() => confirmTip()}
              >
                Commit
                {!touchUi && (
                  <>
                    {" "}
                    <kbd>Space</kbd>
                  </>
                )}
              </button>
              <button type="button" className="chrome__btn" onClick={cancelPowerUpMode}>
                Cancel
              </button>
            </>
          ) : null}
          {status === "playing" &&
            !paused &&
            myTurn &&
            powerUpMode !== "clear-row" &&
            powerUpMode !== "tip" && (
              <button
                type="button"
                className="chrome__btn chrome__btn--accent"
                onClick={placeAtCursor}
                disabled={dropBusy || swarmBusy}
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

      <div className="game-viewport">
        {children}
        <PackageSwarm />
        <PowerUpToast />
      </div>

      <PowerUpHud />

      <RematchDialog />
    </div>
  );
}
