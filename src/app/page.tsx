"use client";

import dynamic from "next/dynamic";
import { useGameStore } from "@/game/store";
import { GameChrome } from "@/ui/GameChrome";
import { LobbyScreen } from "@/ui/LobbyScreen";
import { SetupScreen } from "@/ui/SetupScreen";

const GameCanvas = dynamic(() => import("@/scene/GameCanvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => <div className="game-viewport__canvas game-viewport__canvas--loading" />,
});

export default function HomePage() {
  const phase = useGameStore((s) => s.phase);

  if (phase === "setup") {
    return <SetupScreen />;
  }

  if (phase === "lobby") {
    return <LobbyScreen />;
  }

  return (
    <GameChrome>
      <GameCanvas />
    </GameChrome>
  );
}
