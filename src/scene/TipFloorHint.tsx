"use client";

import { useMemo } from "react";
import { Color } from "three";
import { useGameStore } from "@/game/store";
import type { TipDown } from "@/game/tipBoard";
import type { BoardDims } from "@/game/types";

const HINT_COLOR = "#3ecfc8";

type TipFloorHintProps = {
  dims: BoardDims;
  spacing?: number;
};

/**
 * Spectator-only: which face the opponent is tipping to become the floor.
 * Does not rotate the local cube — view stays where you left it.
 */
export function TipFloorHint({ dims, spacing = 1 }: TipFloorHintProps) {
  const watch = useGameStore((s) => s.watchPowerUp);
  const color = useMemo(() => new Color(HINT_COLOR), []);

  if (!watch || watch.kind !== "tip" || !watch.toDown || watch.toDown === "-y") {
    return null;
  }

  const { position, size } = facePlane(watch.toDown, dims, spacing);

  return (
    <mesh position={position} renderOrder={3}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

function facePlane(
  toDown: TipDown,
  dims: BoardDims,
  spacing: number,
): { position: [number, number, number]; size: [number, number, number] } {
  const hx = (dims.x * spacing) / 2;
  const hy = (dims.y * spacing) / 2;
  const hz = (dims.z * spacing) / 2;
  const thick = spacing * 0.06;
  const pad = spacing * 0.02;

  switch (toDown) {
    case "+y":
      return {
        position: [0, hy + pad, 0],
        size: [dims.x * spacing * 0.96, thick, dims.z * spacing * 0.96],
      };
    case "-y":
      return {
        position: [0, -hy - pad, 0],
        size: [dims.x * spacing * 0.96, thick, dims.z * spacing * 0.96],
      };
    case "+x":
      return {
        position: [hx + pad, 0, 0],
        size: [thick, dims.y * spacing * 0.96, dims.z * spacing * 0.96],
      };
    case "-x":
      return {
        position: [-hx - pad, 0, 0],
        size: [thick, dims.y * spacing * 0.96, dims.z * spacing * 0.96],
      };
    case "+z":
      return {
        position: [0, 0, hz + pad],
        size: [dims.x * spacing * 0.96, dims.y * spacing * 0.96, thick],
      };
    case "-z":
      return {
        position: [0, 0, -hz - pad],
        size: [dims.x * spacing * 0.96, dims.y * spacing * 0.96, thick],
      };
  }
}
