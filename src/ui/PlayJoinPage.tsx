"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { normalizeRoomCode } from "@/game/roomCode";
import { hydrateLocalNameFromStorage, useGameStore } from "@/game/store";
import { joinOnlineRoom } from "@/online/session";
import { LobbyScreen } from "./LobbyScreen";
import { GameChrome } from "./GameChrome";

const GameCanvas = dynamic(() => import("@/scene/GameCanvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => <div className="game-viewport__canvas game-viewport__canvas--loading" />,
});

type PlayJoinPageProps = {
  code: string;
};

export function PlayJoinPage({ code }: PlayJoinPageProps) {
  const phase = useGameStore((s) => s.phase);
  const localName = useGameStore((s) => s.localName);
  const setLocalName = useGameStore((s) => s.setLocalName);
  const onlineError = useGameStore((s) => s.onlineError);
  const setOnlineError = useGameStore((s) => s.setOnlineError);
  const setPlayMode = useGameStore((s) => s.setPlayMode);

  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const normalized = normalizeRoomCode(code);

  useEffect(() => {
    setPlayMode("online");
    hydrateLocalNameFromStorage();
  }, [setPlayMode]);

  if (phase === "lobby") {
    return <LobbyScreen />;
  }

  if (phase === "playing") {
    return (
      <GameChrome>
        <GameCanvas />
      </GameChrome>
    );
  }

  return (
    <div className="setup">
      <div className="setup__atmosphere" aria-hidden />
      <header className="setup__header">
        <p className="setup__brand">Voxel Toe</p>
        <h1 className="setup__title">Join game</h1>
        <p className="setup__lede">
          Room <strong>{normalized || code}</strong>
        </p>
      </header>

      <section className="setup__section" aria-label="Your name">
        <h2 className="setup__label">Your name</h2>
        <input
          className="setup__input"
          type="text"
          maxLength={16}
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="Name"
          autoComplete="nickname"
        />
      </section>

      {onlineError ? <p className="setup__error">{onlineError}</p> : null}

      <button
        type="button"
        className="setup__start"
        disabled={busy || pending}
        onClick={() => {
          setBusy(true);
          setOnlineError(null);
          startTransition(async () => {
            try {
              await joinOnlineRoom(normalized || code, localName);
            } catch (err) {
              setOnlineError(err instanceof Error ? err.message : "Could not join");
            } finally {
              setBusy(false);
            }
          });
        }}
      >
        Join
      </button>
    </div>
  );
}
