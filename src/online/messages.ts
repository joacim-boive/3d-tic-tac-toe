import type { CellCoord, PlacementMode, PlayerId, PlayerNames, PresetId } from "@/game/types";
import type { PowerUpId, PowerUpInventory, SwarmPlan } from "@/game/powerUps";

export type PresenceData = {
  seat: PlayerId;
  name: string;
  /** Host only — preset for the match. */
  preset?: PresetId;
  /** Host only — free vs drop placement. */
  placement?: PlacementMode;
};

export type HelloMessage = {
  type: "hello";
  seat: PlayerId;
  name: string;
  preset?: PresetId;
  placement?: PlacementMode;
};

export type ReadyMessage = {
  type: "ready";
  names: PlayerNames;
  preset: PresetId;
  placement?: PlacementMode;
};

export type PlaceMessage = {
  type: "place";
  x: number;
  y: number;
  z: number;
  by: PlayerId;
};

export type RematchMessage = {
  type: "rematch";
  seat: PlayerId;
  accept: boolean;
};

export type PackageSwarmMessage = {
  type: "package-swarm";
  seed: number;
  liveIndex: 0 | 1 | 2;
  earner: PlayerId;
  packages: SwarmPlan["packages"];
};

export type PackageResultMessage = {
  type: "package-result";
  /** Who tapped. */
  by: PlayerId;
  index: number;
  outcome: "dud" | "claim" | "deny";
  kind?: PowerUpId;
};

/** Opponent toast + spectator awareness (no board payload). */
export type PowerUpNotifyMessage = {
  type: "powerup-notify";
  kind: PowerUpId;
  by: PlayerId;
  phase: "activate" | "cancel" | "confirm";
};

/** Live Clear aiming for the spectator (shaft follows without granting controls). */
export type PowerUpAimMessage = {
  type: "powerup-aim";
  kind: "clear-row";
  by: PlayerId;
  active: boolean;
  clearAxis?: "x" | "y" | "z";
  cursor?: CellCoord;
};

/**
 * Tip intent for the spectator — which face will become the floor.
 * Does not rotate their cube while aiming; camera/view stay put.
 */
export type PowerUpTipAimMessage = {
  type: "powerup-tip-aim";
  by: PlayerId;
  active: boolean;
  /** Face becoming floor, or null while still upright / spinning. */
  toDown?: "+x" | "-x" | "+y" | "-y" | "+z" | "-z" | null;
};

/** Opponent committed Tip — spectator plays rotate + ball-drop. */
export type PowerUpTipCommitMessage = {
  type: "powerup-tip-commit";
  by: PlayerId;
  tipEuler: { x: number; y: number; z: number };
};

export type StateMessage = {
  type: "state";
  board: Array<[string, PlayerId]>;
  currentPlayer: PlayerId;
  names: PlayerNames;
  preset: PresetId;
  placement?: PlacementMode;
  occupiedCount: number;
  status: "playing" | "won" | "draw";
  winner: PlayerId | null;
  winningLine: CellCoord[];
  /** Cell that completed the win (optional for older clients). */
  winningCell?: CellCoord | null;
  inventory?: PowerUpInventory;
  powerUpsEnabled?: boolean;
  bonusPlacesRemaining?: number;
  placedThisTurn?: boolean;
};

export type RoomMessage =
  | HelloMessage
  | ReadyMessage
  | PlaceMessage
  | RematchMessage
  | PackageSwarmMessage
  | PackageResultMessage
  | PowerUpNotifyMessage
  | PowerUpAimMessage
  | PowerUpTipAimMessage
  | PowerUpTipCommitMessage
  | StateMessage;
