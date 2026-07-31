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
  earner: PlayerId;
  caught: boolean;
  kind?: PowerUpId;
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
};

export type RoomMessage =
  | HelloMessage
  | ReadyMessage
  | PlaceMessage
  | RematchMessage
  | PackageSwarmMessage
  | PackageResultMessage
  | StateMessage;
