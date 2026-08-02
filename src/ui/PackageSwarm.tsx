"use client";

import { useEffect, useRef } from "react";
import { SWARM_DURATION_MS } from "@/game/powerUps";
import { useGameStore } from "@/game/store";

/**
 * Swarm timer + a11y status. Visual packages live in the 3D scene (`SwarmPackages`);
 * this overlay is pointer-transparent so canvas raycasts own the catch.
 */
export function PackageSwarm() {
  const swarm = useGameStore((s) => s.swarm);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const swarmPopped = useGameStore((s) => s.swarmPopped);
  const playMode = useGameStore((s) => s.playMode);
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

  return (
    <div className="swarm swarm--passive" role="status" aria-live="polite">
      Catch a glowing package
    </div>
  );
}
