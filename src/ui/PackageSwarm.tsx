"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SWARM_DURATION_MS } from "@/game/powerUps";
import { useGameStore } from "@/game/store";

/**
 * 2D overlay: three packages streak across; tap the live one to earn a power-up.
 */
export function PackageSwarm() {
  const swarm = useGameStore((s) => s.swarm);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const seat = useGameStore((s) => s.seat);
  const playMode = useGameStore((s) => s.playMode);
  const catchSwarmPackage = useGameStore((s) => s.catchSwarmPackage);
  const endSwarm = useGameStore((s) => s.endSwarm);
  const [popped, setPopped] = useState<Record<number, "dud" | "live">>({});
  const ended = useRef(false);

  useEffect(() => {
    ended.current = false;
    setPopped({});
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

  if (!swarm || !swarmBusy) return null;

  const canCatch =
    playMode === "hotseat" ||
    playMode === "ai" ||
    (playMode === "online" && seat === swarm.earner);

  const onTap = (index: number) => {
    if (!canCatch || ended.current) return;
    if (popped[index]) return;
    if (index === swarm.liveIndex) {
      setPopped((p) => ({ ...p, [index]: "live" }));
      ended.current = true;
      window.setTimeout(() => catchSwarmPackage(index), 180);
    } else {
      setPopped((p) => ({ ...p, [index]: "dud" }));
    }
  };

  return (
    <div className="swarm" role="dialog" aria-label="Catch a power-up package">
      <p className="swarm__hint">{canCatch ? "Tap the live package!" : "Watching…"}</p>
      {swarm.packages.map((pkg) => {
        const duration = SWARM_DURATION_MS * pkg.speed;
        const state = popped[pkg.id];
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
            onClick={() => onTap(pkg.id)}
            disabled={!canCatch || !!state}
            aria-label={`Package ${pkg.id + 1}`}
          >
            <span className="swarm__box" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
