"use client";

import { useGameStore } from "@/game/store";
import { PLAYER_COLORS } from "@/game/types";
import { leaveOnlineSession, publishRematchVote } from "@/online/session";

export function RematchDialog() {
  const playMode = useGameStore((s) => s.playMode);
  const status = useGameStore((s) => s.status);
  const winner = useGameStore((s) => s.winner);
  const seat = useGameStore((s) => s.seat);
  const rematchVotes = useGameStore((s) => s.rematchVotes);
  const displayName = useGameStore((s) => s.displayName);
  const onlineStatus = useGameStore((s) => s.onlineStatus);

  if (playMode !== "online") return null;
  if (status !== "won" && status !== "draw") return null;
  if (onlineStatus === "paused") return null;

  const winnerColor = winner ? PLAYER_COLORS[winner] : undefined;
  const headline =
    status === "won" && winner ? (
      <>
        <span
          className="win-celeb__tag"
          style={winnerColor ? { ["--winner" as string]: winnerColor } : undefined}
        >
          {displayName(winner)}
        </span>
        <span className="win-celeb__wins"> wins</span>
      </>
    ) : (
      "Draw"
    );

  const myVote = seat ? rematchVotes[seat] : null;
  const theirSeat = seat === "a" ? "b" : "a";
  const theirVote = rematchVotes[theirSeat];

  let detail = "Rematch?";
  if (myVote === true && theirVote == null) {
    detail = `Waiting for ${displayName(theirSeat)}…`;
  } else if (theirVote === true && myVote == null) {
    detail = `${displayName(theirSeat)} wants a rematch`;
  }

  return (
    <div className="rematch" role="dialog" aria-labelledby="rematch-title">
      <div className="rematch__card">
        <div className="rematch__copy">
          <h2 id="rematch-title" className="rematch__title">
            {headline}
          </h2>
          <p className="rematch__detail">{detail}</p>
        </div>
        <div className="rematch__actions">
          <button
            type="button"
            className="setup__start"
            disabled={myVote === true}
            onClick={() => publishRematchVote(true)}
          >
            Rematch
          </button>
          <button
            type="button"
            className="setup__secondary"
            onClick={() => {
              if (myVote == null) publishRematchVote(false);
              else void leaveOnlineSession();
            }}
          >
            Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
