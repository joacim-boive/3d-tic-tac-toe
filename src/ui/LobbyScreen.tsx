"use client";

import { useState } from "react";
import { useGameStore } from "@/game/store";
import { leaveOnlineSession, shareUrlForRoom } from "@/online/session";

export function LobbyScreen() {
  const roomId = useGameStore((s) => s.roomId);
  const seat = useGameStore((s) => s.seat);
  const localName = useGameStore((s) => s.localName);
  const onlineError = useGameStore((s) => s.onlineError);
  const [copied, setCopied] = useState(false);

  if (!roomId) return null;

  const link = shareUrlForRoom(roomId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="setup">
      <div className="setup__atmosphere" aria-hidden />
      <header className="setup__header">
        <p className="setup__brand">Voxel Toe</p>
        <h1 className="setup__title">Lobby</h1>
        <p className="setup__lede">
          {seat === "a"
            ? "Share the code or link. The match starts when your opponent joins."
            : "Waiting for the host…"}
        </p>
      </header>

      <section className="setup__section" aria-label="Room code">
        <h2 className="setup__label">Room code</h2>
        <p className="lobby__code">{roomId}</p>
        <p className="lobby__you">You are {localName || "…"}</p>
      </section>

      {seat === "a" ? (
        <section className="setup__section" aria-label="Share link">
          <h2 className="setup__label">Invite link</h2>
          <p className="lobby__link">{link}</p>
          <button type="button" className="setup__secondary" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </section>
      ) : null}

      {onlineError ? <p className="setup__error">{onlineError}</p> : null}

      <p className="lobby__waiting">Waiting for opponent…</p>

      <button type="button" className="setup__secondary" onClick={() => void leaveOnlineSession()}>
        Cancel
      </button>
    </div>
  );
}
