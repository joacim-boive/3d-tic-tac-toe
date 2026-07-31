"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { MAX_PER_KIND, SWARM_DURATION_MS } from "@/game/powerUps";
import { useGameStore } from "@/game/store";
import type { PlayerId } from "@/game/types";

/**
 * Competitive flyby (vs AI / online): either seat can tap.
 * Live + room → claim; live + full → deny. Hotseat has no power-ups.
 */
export function PackageSwarm() {
  const swarm = useGameStore((s) => s.swarm);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const swarmPopped = useGameStore((s) => s.swarmPopped);
  const seat = useGameStore((s) => s.seat);
  const playMode = useGameStore((s) => s.playMode);
  const inventory = useGameStore((s) => s.inventory);
  const catchSwarmPackage = useGameStore((s) => s.catchSwarmPackage);
  const endSwarm = useGameStore((s) => s.endSwarm);
  const ended = useRef(false);

  useEffect(() => {
    ended.current = false;
    if (!swarm || !swarmBusy) return;
    const maxDelay = Math.max(...swarm.packages.map((p) => p.delayMs));
    const t = window.setTimeout(
      () => {
        if (!ended.current) {
          ended.current = true;
          endSwarm();
        }
      },
      SWARM_DURATION_MS + maxDelay + 120,
    );
    return () => window.clearTimeout(t);
  }, [swarm, swarmBusy, endSwarm]);

  useEffect(() => {
    if (!swarm) return;
    const live = swarmPopped[swarm.liveIndex];
    if (live === "claim" || live === "deny") {
      ended.current = true;
    }
  }, [swarm, swarmPopped]);

  if (!swarm || !swarmBusy || playMode === "hotseat") return null;

  const canCatch =
    playMode === "ai" || (playMode === "online" && seat != null);

  const catcher: PlayerId =
    playMode === "online" && seat != null ? seat : "a";

  const catcherFull = !Object.values(inventory[catcher]).some((n) => n < MAX_PER_KIND);

  const onTap = (index: number, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canCatch || ended.current) return;
    if (swarmPopped[index]) return;
    if (index === swarm.liveIndex) {
      ended.current = true;
    }
    catchSwarmPackage(index, catcher);
  };

  return (
    <div className="swarm" role="dialog" aria-label="Compete for a power-up package">
      <div className="swarm__hint">
        <span>{canCatch ? (catcherFull ? "Tap to deny!" : "Tap to claim!") : "Watching…"}</span>
      </div>
      {swarm.packages.map((pkg) => {
        const duration = SWARM_DURATION_MS * pkg.speed;
        const state = swarmPopped[pkg.id];
        return (
          <button
            key={pkg.id}
            type="button"
            className={`swarm__pkg${state ? ` is-${state}` : ""}`}
            style={
              {
                ["--x0" as string]: `${pkg.x0 * 100}%`,
                ["--y0" as string]: `${pkg.y0 * 100}%`,
                ["--x1" as string]: `${pkg.x1 * 100}%`,
                ["--y1" as string]: `${pkg.y1 * 100}%`,
                ["--dur" as string]: `${duration}ms`,
                ["--delay" as string]: `${pkg.delayMs}ms`,
              } as CSSProperties
            }
            onPointerDown={(e) => onTap(pkg.id, e)}
            aria-disabled={!canCatch || !!state}
            tabIndex={canCatch && !state ? 0 : -1}
            aria-label={`Package ${pkg.id + 1}`}
          >
            <span className="swarm__box" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
