"use client";

import { useEffect } from "react";
import { getPreset } from "@/game/presets";
import {
  POWER_UP_IDS,
  POWER_UP_LABELS,
  type PowerUpId,
} from "@/game/powerUps";
import { useGameStore } from "@/game/store";
import { canTipPreset, tipDownFromEuler } from "@/game/tipBoard";
import { PLAYER_COLORS, PLAYER_LABELS, type PlayerId } from "@/game/types";
import type { Axis } from "@/game/clearRow";

function InventoryRow({
  player,
  actionable,
}: {
  player: PlayerId;
  actionable: boolean;
}) {
  const inventory = useGameStore((s) => s.inventory[player]);
  const activatePowerUp = useGameStore((s) => s.activatePowerUp);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const bonusPlacesRemaining = useGameStore((s) => s.bonusPlacesRemaining);
  const presetId = useGameStore((s) => s.presetId);
  const dims = getPreset(presetId).dims;

  return (
    <div className="powerups__row" style={{ ["--seat" as string]: PLAYER_COLORS[player] }}>
      <span className="powerups__who">{PLAYER_LABELS[player]}</span>
      <div className="powerups__chips">
        {POWER_UP_IDS.map((id) => {
          const count = inventory[id];
          const tipBlocked = id === "tip" && !canTipPreset(dims);
          const active =
            powerUpMode === id || (id === "extra-turn" && bonusPlacesRemaining > 0);
          const canUse = actionable && count > 0 && !tipBlocked && !powerUpMode;
          return (
            <button
              key={id}
              type="button"
              className={`powerups__chip${active ? " is-active" : ""}${count === 0 ? " is-empty" : ""}`}
              disabled={!canUse}
              title={
                tipBlocked
                  ? "Tip requires a cube board"
                  : `${POWER_UP_LABELS[id]} ×${count}`
              }
              onClick={() => activatePowerUp(id)}
            >
              <span className="powerups__chip-label">{shortLabel(id)}</span>
              <span className="powerups__chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shortLabel(id: PowerUpId): string {
  if (id === "extra-turn") return "Extra";
  if (id === "clear-row") return "Clear";
  return "Tip";
}

export function PowerUpHud() {
  const powerUpsEnabled = useGameStore((s) => s.powerUpsEnabled);
  const playMode = useGameStore((s) => s.playMode);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const seat = useGameStore((s) => s.seat);
  const status = useGameStore((s) => s.status);
  const onlineStatus = useGameStore((s) => s.onlineStatus);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const clearAxis = useGameStore((s) => s.clearAxis);
  const setClearAxis = useGameStore((s) => s.setClearAxis);
  const cancelPowerUpMode = useGameStore((s) => s.cancelPowerUpMode);
  const confirmClearRow = useGameStore((s) => s.confirmClearRow);
  const confirmTip = useGameStore((s) => s.confirmTip);
  const tipEuler = useGameStore((s) => s.tipEuler);
  const tipFalling = useGameStore((s) => s.tipFalling);
  const cursor = useGameStore((s) => s.cursor);
  const powerUpToast = useGameStore((s) => s.powerUpToast);
  const clearPowerUpToast = useGameStore((s) => s.clearPowerUpToast);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const dropBusy = useGameStore((s) => s.dropBusy);
  const bonusPlacesRemaining = useGameStore((s) => s.bonusPlacesRemaining);

  useEffect(() => {
    if (!powerUpToast) return;
    const t = window.setTimeout(() => clearPowerUpToast(), 3200);
    return () => window.clearTimeout(t);
  }, [powerUpToast, clearPowerUpToast]);

  if (!powerUpsEnabled) return null;

  const myTurn =
    status === "playing" &&
    !swarmBusy &&
    !dropBusy &&
    !tipFalling &&
    (playMode === "hotseat" ||
      (playMode === "ai" && currentPlayer === "a") ||
      (playMode === "online" &&
        seat != null &&
        currentPlayer === seat &&
        onlineStatus === "playing"));

  const tipFloor = tipDownFromEuler(tipEuler);
  const tipReady = tipFloor !== "-y";

  return (
    <div className="powerups">
      {powerUpToast ? (
        <p className="powerups__toast" role="status">
          {powerUpToast}
          <button type="button" className="powerups__toast-dismiss" onClick={clearPowerUpToast}>
            ×
          </button>
        </p>
      ) : null}

      <div className="powerups__inventories">
        <InventoryRow player="a" actionable={myTurn && currentPlayer === "a"} />
        <InventoryRow player="b" actionable={myTurn && currentPlayer === "b"} />
      </div>

      {bonusPlacesRemaining > 0 || powerUpMode === "extra-turn" ? (
        <div className="powerups__mode">
          <span>Extra turn — place again after this one</span>
          {bonusPlacesRemaining > 0 && powerUpMode === "extra-turn" ? (
            <button type="button" className="chrome__btn" onClick={cancelPowerUpMode}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {powerUpMode === "clear-row" ? (
        <div className="powerups__mode">
          <span>Clear row along</span>
          <div className="powerups__axis" role="group" aria-label="Axis">
            {(["x", "y", "z"] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                className={`mode-chip${clearAxis === axis ? " is-selected" : ""}`}
                onClick={() => setClearAxis(axis as Axis)}
                aria-pressed={clearAxis === axis}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="chrome__btn chrome__btn--accent"
            onClick={() => {
              const a = clearAxis === "x" ? cursor.y : clearAxis === "y" ? cursor.x : cursor.x;
              const b = clearAxis === "x" ? cursor.z : clearAxis === "y" ? cursor.z : cursor.y;
              confirmClearRow(a, b);
            }}
          >
            Clear at cursor
          </button>
          <button type="button" className="chrome__btn" onClick={cancelPowerUpMode}>
            Cancel
          </button>
        </div>
      ) : null}

      {powerUpMode === "tip" ? (
        <div className="powerups__mode">
          <span>
            {tipFalling
              ? "Balls falling…"
              : tipReady
                ? "Box tipped — drop the balls"
                : "Drag the box to tip it onto a side"}
          </span>
          {!tipFalling ? (
            <>
              <button
                type="button"
                className="chrome__btn chrome__btn--accent"
                disabled={!tipReady}
                onClick={() => confirmTip()}
              >
                Drop
              </button>
              <button type="button" className="chrome__btn" onClick={cancelPowerUpMode}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
