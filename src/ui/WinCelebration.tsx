"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  AI_DIFFICULTY_LABELS,
  formatPlayTime,
  getDifficultyStats,
  nextHarderDifficulty,
  readGameStatsFromStorage,
  type DifficultyStats,
} from "@/game/gameStats";
import { useGameStore } from "@/game/store";
import { PLAYER_COLORS } from "@/game/types";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";

/**
 * Local (hotseat / vs AI) game-over panel: colored winner tag, level stats,
 * harder-level nudge, and rematch. Online keeps RematchDialog for votes.
 * Confetti is rendered by GameChrome inside the viewport.
 */
export function WinCelebration() {
  const touchUi = useCoarsePointer();
  const playMode = useGameStore((s) => s.playMode);
  const status = useGameStore((s) => s.status);
  const winner = useGameStore((s) => s.winner);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const presetId = useGameStore((s) => s.presetId);
  const occupiedCount = useGameStore((s) => s.occupiedCount);
  const displayName = useGameStore((s) => s.displayName);
  const rematch = useGameStore((s) => s.rematch);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);

  const [levelStats, setLevelStats] = useState<DifficultyStats | null>(null);

  const celebrating = status === "won" || status === "draw";
  const showPanel = celebrating && playMode !== "online";

  // Re-read after store records the finished match (same tick / next paint).
  useEffect(() => {
    if (!showPanel || playMode !== "ai") {
      setLevelStats(null);
      return;
    }
    const read = () =>
      setLevelStats(getDifficultyStats(readGameStatsFromStorage(), aiDifficulty));
    read();
    const t = window.setTimeout(read, 0);
    return () => window.clearTimeout(t);
  }, [showPanel, playMode, aiDifficulty, status, winner, occupiedCount]);

  if (!showPanel) return null;

  const harder = playMode === "ai" ? nextHarderDifficulty(aiDifficulty, presetId) : null;
  const showNudge = status === "won" && winner === "a" && harder != null;
  const winnerColor = winner ? PLAYER_COLORS[winner] : undefined;
  const winnerStyle = winnerColor
    ? ({ ["--winner"]: winnerColor } as CSSProperties)
    : undefined;

  const headline =
    status === "won" && winner ? (
      <>
        <span className="win-celeb__tag" style={winnerStyle}>
          {displayName(winner)}
        </span>
        <span className="win-celeb__wins"> wins!</span>
      </>
    ) : (
      <span className="win-celeb__draw">Draw</span>
    );

  const onTryHarder = () => {
    if (!harder) return;
    setAiDifficulty(harder);
    rematch();
  };

  return (
    <div className="win-celeb" role="dialog" aria-labelledby="win-celeb-title">
      <div className="win-celeb__card">
        <div className="win-celeb__copy">
          <h2 id="win-celeb-title" className="win-celeb__title">
            {headline}
          </h2>

          {playMode === "ai" && levelStats ? (
            <p
              className="win-celeb__stats"
              aria-label={`${AI_DIFFICULTY_LABELS[aiDifficulty]} stats`}
            >
              <span className="win-celeb__level">{AI_DIFFICULTY_LABELS[aiDifficulty]}</span>
              <span className="win-celeb__stat">
                {levelStats.played} play{levelStats.played === 1 ? "" : "s"}
              </span>
              <span className="win-celeb__stat" aria-hidden>
                ·
              </span>
              <span className="win-celeb__stat">
                {levelStats.wins}–{levelStats.losses}
                {levelStats.draws > 0 ? `–${levelStats.draws}` : ""}
              </span>
              <span className="win-celeb__stat" aria-hidden>
                ·
              </span>
              <span className="win-celeb__stat">{formatPlayTime(levelStats.totalTimeMs)}</span>
            </p>
          ) : null}

          {showNudge && harder ? (
            <p className="win-celeb__nudge">
              Nice win — try {AI_DIFFICULTY_LABELS[harder]} next?
            </p>
          ) : null}
        </div>

        <div className="win-celeb__actions">
          {showNudge && harder ? (
            <button type="button" className="setup__start" onClick={onTryHarder}>
              Try {AI_DIFFICULTY_LABELS[harder]}
            </button>
          ) : null}
          <button
            type="button"
            className={showNudge ? "setup__secondary" : "setup__start"}
            onClick={rematch}
          >
            Rematch
            {!touchUi && (
              <>
                {" "}
                <kbd>R</kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
