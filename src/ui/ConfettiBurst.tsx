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
  // Two waves so the celebration stays readable for several seconds.
  for (let wave = 0; wave < 2; wave += 1) {
    for (let i = 0; i < 36; i += 1) {
      const kind = i % 6 === 0 ? "spark" : "confetti";
      const id = wave * 36 + i;
      out.push({
        id,
        left: 3 + ((id * 17) % 94),
        delay: wave * 0.85 + (i % 14) * 0.06 + (i % 5) * 0.02,
        duration: kind === "spark" ? 2.2 + (i % 4) * 0.15 : 3.4 + (i % 6) * 0.2,
        drift: ((id * 13) % 80) - 40,
        size: kind === "spark" ? 6 + (i % 3) : 8 + (i % 5) * 1.5,
        rotate: (id * 47) % 360,
        color: palette[id % palette.length]!,
        kind,
      });
    }
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
