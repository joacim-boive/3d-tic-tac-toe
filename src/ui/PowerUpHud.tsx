"use client";

import { getPreset } from "@/game/presets";
import { POWER_UP_LABELS, powerUpsForPreset, type PowerUpId } from "@/game/powerUps";
import { useGameStore } from "@/game/store";
import { canTipPreset } from "@/game/tipBoard";
import { PLAYER_COLORS, type PlayerId } from "@/game/types";
import { clearFixedFromCursor, type Axis } from "@/game/clearRow";

function InventoryRow({ player, actionable }: { player: PlayerId; actionable: boolean }) {
  const inventory = useGameStore((s) => s.inventory[player]);
  const pulse = useGameStore((s) => s.inventoryPulse);
  const activatePowerUp = useGameStore((s) => s.activatePowerUp);
  const powerUpMode = useGameStore((s) => s.powerUpMode);
  const bonusPlacesRemaining = useGameStore((s) => s.bonusPlacesRemaining);
  const presetId = useGameStore((s) => s.presetId);
  const displayName = useGameStore((s) => s.displayName);
  const dims = getPreset(presetId).dims;
  const kinds = powerUpsForPreset(presetId);
  const rowAwarded = pulse?.by === player;

  return (
    <div
      className={`powerups__row${rowAwarded ? " is-awarded" : ""}`}
      style={{ ["--seat" as string]: PLAYER_COLORS[player] }}
    >
      <span className="powerups__who">{displayName(player)}</span>
      <div className="powerups__chips">
        {kinds.map((id) => {
          const count = inventory[id];
          const tipBlocked = id === "tip" && !canTipPreset(dims);
          const active = powerUpMode === id || (id === "extra-turn" && bonusPlacesRemaining > 0);
          const canUse = actionable && count > 0 && !tipBlocked && !powerUpMode;
          const awarded = pulse?.by === player && pulse.kind === id;
          return (
            <button
              key={awarded ? `${id}-pulse-${pulse.id}` : id}
              type="button"
              className={`powerups__chip${active ? " is-active" : ""}${count === 0 ? " is-empty" : ""}${awarded ? " is-awarded" : ""}`}
              disabled={!canUse}
              title={
                tipBlocked
                  ? "Tip requires a cube board"
                  : awarded
                    ? `Caught ${POWER_UP_LABELS[id]}!`
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
  const tipFalling = useGameStore((s) => s.tipFalling);
  const cursor = useGameStore((s) => s.cursor);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const dropBusy = useGameStore((s) => s.dropBusy);
  const bonusPlacesRemaining = useGameStore((s) => s.bonusPlacesRemaining);

  if (!powerUpsEnabled || playMode === "hotseat") return null;

  const myTurn =
    status === "playing" &&
    !swarmBusy &&
    !dropBusy &&
    !tipFalling &&
    ((playMode === "ai" && currentPlayer === "a") ||
      (playMode === "online" &&
        seat != null &&
        currentPlayer === seat &&
        onlineStatus === "playing"));

  return (
    <div className="powerups">
      <div className="powerups__inventories">
        <InventoryRow player="a" actionable={myTurn && currentPlayer === "a"} />
        <InventoryRow player="b" actionable={myTurn && currentPlayer === "b"} />
      </div>

      {bonusPlacesRemaining > 0 || powerUpMode === "extra-turn" ? (
        <div className="powerups__mode">
          {bonusPlacesRemaining > 0 && powerUpMode === "extra-turn" ? (
            <button type="button" className="chrome__btn" onClick={cancelPowerUpMode}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {powerUpMode === "clear-row" ? (
        <div className="powerups__mode">
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
              const fixed = clearFixedFromCursor(clearAxis, cursor);
              confirmClearRow(fixed.a, fixed.b);
            }}
          >
            Clear
          </button>
          <button type="button" className="chrome__btn" onClick={cancelPowerUpMode}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
