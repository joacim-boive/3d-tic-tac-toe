import type { PlayMode } from "@/game/types";

/**
 * Bottom inventory HUD (both seats' Extra / Clear / Tip chips).
 * Hidden for hotseat and when power-ups are off — those are intentional,
 * not a chrome regression.
 */
export function shouldShowPowerUpHud(opts: {
  powerUpsEnabled: boolean;
  playMode: PlayMode;
}): boolean {
  return opts.powerUpsEnabled && opts.playMode !== "hotseat";
}
