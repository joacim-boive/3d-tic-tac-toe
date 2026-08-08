"use client";

import { PLAYER_COLORS, type PlayerId } from "@/game/types";

type ConfettiBurstProps = {
  /** Winner seat — pieces tint toward their color. */
  winner: PlayerId;
  /** Remount key so each win replays the burst. */
  burstId: string;
};

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  size: number;
  rotate: number;
  color: string;
  kind: "confetti" | "spark";
};

const ACCENTS = ["#ffd166", "#fff4c8", "#ffe8a3", "#ffffff"];

function buildPieces(winner: PlayerId): Piece[] {
  const winnerColor = PLAYER_COLORS[winner];
  const other = PLAYER_COLORS[winner === "a" ? "b" : "a"];
  const palette = [winnerColor, winnerColor, other, ...ACCENTS];
  const out: Piece[] = [];
  for (let i = 0; i < 48; i += 1) {
    const kind = i % 7 === 0 ? "spark" : "confetti";
    out.push({
      id: i,
      left: 4 + ((i * 17) % 92),
      delay: (i % 12) * 0.05 + (i % 5) * 0.02,
      duration: kind === "spark" ? 1.35 + (i % 4) * 0.12 : 1.8 + (i % 6) * 0.15,
      drift: ((i * 13) % 70) - 35,
      size: kind === "spark" ? 5 + (i % 3) : 7 + (i % 5) * 1.4,
      rotate: (i * 47) % 360,
      color: palette[i % palette.length]!,
      kind,
    });
  }
  return out;
}

/**
 * Lightweight DOM confetti + firework sparks — no particle library.
 * Mount only while celebrating a win (inside `.game-viewport`).
 */
export function ConfettiBurst({ winner, burstId }: ConfettiBurstProps) {
  const pieces = buildPieces(winner);

  return (
    <div className="confetti" aria-hidden>
      <div className="confetti__firework confetti__firework--left" />
      <div className="confetti__firework confetti__firework--right" />
      <div className="confetti__firework confetti__firework--mid" />
      {pieces.map((piece) => (
        <span
          key={`${burstId}-${piece.id}`}
          className={`confetti__piece confetti__piece--${piece.kind}`}
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.kind === "spark" ? piece.size : piece.size * 0.45,
            background: piece.color,
            color: piece.color,
            ["--drift" as string]: `${piece.drift}px`,
            ["--spin" as string]: `${piece.rotate}deg`,
            ["--fall-duration" as string]: `${piece.duration}s`,
            ["--fall-delay" as string]: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
