"use client";

import type { ReactNode } from "react";
import { useGameStore } from "@/game/store";
import { tipDownFromEuler } from "@/game/tipBoard";
import { PLAYER_COLORS } from "@/game/types";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { leaveOnlineSession } from "@/online/session";
import { RematchDialog } from "./RematchDialog";
import { ConfettiBurst } from "./ConfettiBurst";
import { PackageSwarm } from "./PackageSwarm";
import { PowerUpHud } from "./PowerUpHud";
import { PowerUpToast } from "./PowerUpToast";
import { StatusToast } from "./StatusToast";
import { useGameControls } from "./useGameControls";
import { WinCelebration } from "./WinCelebration";

type GameChromeProps = {
  children: ReactNode;
};

export function GameChrome({ children }: GameChromeProps) {
  useGameControls();
  const touchUi = useCoarsePointer();

  const playMode = useGameStore((s) => s.playMode);
  const placement = useGameStore((s) => s.placement);
  const dropBusy = useGameStore((s) => s.dropBusy);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const bonusPlacesRemaining = useGameStore((s) => s.bonusPlacesRemaining);
  const placedThisTurn = useGameStore((s) => s.placedThisTurn);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const watchPowerUp = useGameStore((s) => s.watchPowerUp);
  const watchTipPlayback = useGameStore((s) => s.watchTipPlayback);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const status = useGameStore((s) => s.status);
  const winner = useGameStore((s) => s.winner);
  const occupiedCount = useGameStore((s) => s.occupiedCount);
  const aiming = useGameStore((s) => s.aiming);
  const cursor = useGameStore((s) => s.cursor);
  const seat = useGameStore((s) => s.seat);
  const onlineStatus = useGameStore((s) => s.onlineStatus);
  const playerNames = useGameStore((s) => s.playerNames);
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

  // Toast whose-turn / important notices — skip "Dropping…" (visible in the scene).
  let statusText = "";
  let statusSticky = false;
  let statusShowsTurn = false;
  if (paused) {
    const other = seat === "a" ? "b" : "a";
    const otherName = playerNames[other].trim() || displayName(other);
    statusText = `Waiting for ${otherName} to reconnect…`;
    statusSticky = true;
  } else if (swarmBusy) {
    statusText = "Catch a package — tap a cylinder";
    statusSticky = true;
  } else if (status === "won" || status === "draw" || dropBusy) {
    statusText = "";
  } else if (tipFalling) {
    statusText = "Balls falling…";
  } else if (watchTipPlayback) {
    statusText = playMode === "ai" ? `${displayName("b")} tipping…` : "Opponent tipping…";
  } else if (watchPowerUp?.kind === "clear-row") {
    statusText = `${displayName(watchPowerUp.by)} aiming Clear…`;
    statusSticky = true;
  } else if (watchPowerUp?.kind === "tip") {
    statusText = `${displayName(watchPowerUp.by)} tipping…`;
  } else if (powerUpMode === "clear-row") {
    statusText = "Clear — aim · tap to switch axis";
    statusSticky = true;
  } else if (bonusPlacesRemaining > 0) {
    statusText = `${displayName(currentPlayer)} — extra place (can't finish)`;
    statusShowsTurn = true;
  } else if (placedThisTurn) {
    statusText = `${displayName(currentPlayer)} — Extra or Done`;
    statusShowsTurn = true;
  } else if (playMode === "ai" && currentPlayer === "b") {
    statusText = `${displayName("b")} is thinking…`;
  } else if (status === "playing") {
    statusText =
      placement === "drop"
        ? `${displayName(currentPlayer)} to drop`
        : `${displayName(currentPlayer)} to place`;
    statusShowsTurn = true;
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
        <div className="chrome__meta">
          {status === "playing" && !paused ? (
            <span className="chrome__cell" aria-label="Cursor cell">
              {cursor.x},{cursor.y},{cursor.z}
            </span>
          ) : null}
          {aiming && !paused ? <span className="chrome__aim">Aiming</span> : null}
        </div>
        <div className="chrome__actions">
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
        {status === "won" && winner ? (
          <ConfettiBurst
            winner={winner}
            burstId={`${playMode}-${winner}-${occupiedCount}`}
          />
        ) : null}
        {statusText ? (
          <StatusToast
            message={statusText}
            turnColor={statusShowsTurn ? turnColor : undefined}
            sticky={statusSticky}
          />
        ) : null}
      </div>

      <PowerUpHud />

      <WinCelebration />
      <RematchDialog />
    </div>
  );
}
