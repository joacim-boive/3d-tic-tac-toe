"use client";

import { useEffect, useRef } from "react";
import { aiGrabDelayMs, createPowerUpRng, SWARM_DURATION_MS } from "@/game/powerUps";
import { useGameStore } from "@/game/store";

/**
 * Swarm timer + a11y status. Visual packages live in the 3D scene (`SwarmPackages`);
 * this overlay is pointer-transparent so canvas raycasts own the catch.
 */
export function PackageSwarm() {
  const swarm = useGameStore((s) => s.swarm);
  const swarmBusy = useGameStore((s) => s.swarmBusy);
  const swarmPopped = useGameStore((s) => s.swarmPopped);
  const swarmAiResult = useGameStore((s) => s.swarmAiResult);
  const playMode = useGameStore((s) => s.playMode);
  const endSwarm = useGameStore((s) => s.endSwarm);
  const catchSwarmPackage = useGameStore((s) => s.catchSwarmPackage);
  const ended = useRef(false);

  useEffect(() => {
    ended.current = false;
    if (!swarm || !swarmBusy) return;
    const maxDelay = Math.max(...swarm.packages.map((p) => p.delayMs));
    const fullMs = SWARM_DURATION_MS + maxDelay + 120;
    const seed = swarm.seed;
    const aiTarget = swarmAiResult?.targetIndex;

    // vs AI: AI races the human — taps its aimed package after a reaction delay.
    // Dud taps leave the live pack in play; live claim/deny ends the race.
    let aiTimer: number | undefined;
    if (playMode === "ai" && aiTarget != null) {
      const grabAt = aiGrabDelayMs(swarm, createPowerUpRng(seed ^ 0xc2b2ae35));
      aiTimer = window.setTimeout(() => {
        const s = useGameStore.getState();
        if (!s.swarmBusy || !s.swarm || s.swarm.seed !== seed) return;
        catchSwarmPackage(aiTarget, "b");
      }, Math.min(grabAt, fullMs - 80));
    }

    const t = window.setTimeout(() => {
      if (!ended.current) {
        ended.current = true;
        endSwarm();
      }
    }, fullMs);
    return () => {
      window.clearTimeout(t);
      if (aiTimer !== undefined) window.clearTimeout(aiTimer);
    };
  }, [swarm, swarmBusy, swarmAiResult, playMode, endSwarm, catchSwarmPackage]);

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
