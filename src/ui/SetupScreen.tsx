"use client";

import { useEffect, useState, useTransition } from "react";
import { formatAppVersionLabel } from "@/appVersion";
import { isExtremeAllowed, isImpossibleAllowed } from "@/game/ai";
import { shouldShowOnboardingOnLaunch } from "@/game/onboardingPrefs";
import { PRESETS } from "@/game/presets";
import {
  readSavedGameFromStorage,
  savedGameMatchesSetup,
  type SavedGame,
} from "@/game/savedGame";
import { hydrateLocalNameFromStorage, hydrateSetupFromStorage, useGameStore } from "@/game/store";
import type { AiDifficulty, PlacementMode, PlayMode, PresetId } from "@/game/types";
import { createOnlineRoom, joinOnlineRoom } from "@/online/session";
import { OnboardingOverlay } from "@/ui/onboarding/OnboardingOverlay";

export function SetupScreen() {
  const presetId = useGameStore((s) => s.presetId);
  const playMode = useGameStore((s) => s.playMode);
  const placement = useGameStore((s) => s.placement);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const powerUpsEnabled = useGameStore((s) => s.powerUpsEnabled);
  const localName = useGameStore((s) => s.localName);
  const onlineError = useGameStore((s) => s.onlineError);
  const setPresetId = useGameStore((s) => s.setPresetId);
  const setPlayMode = useGameStore((s) => s.setPlayMode);
  const setPlacement = useGameStore((s) => s.setPlacement);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);
  const setPowerUpsEnabled = useGameStore((s) => s.setPowerUpsEnabled);
  const setLocalName = useGameStore((s) => s.setLocalName);
  const setOnlineError = useGameStore((s) => s.setOnlineError);
  const startGame = useGameStore((s) => s.startGame);
  const restoreGame = useGameStore((s) => s.restoreGame);

  const [joinCode, setJoinCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<SavedGame | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);

  useEffect(() => {
    hydrateLocalNameFromStorage();
    hydrateSetupFromStorage();
    const show = shouldShowOnboardingOnLaunch();
    setOnboardingOpen(show);
    setOnboardingReady(true);
  }, []);

  useEffect(() => {
    setRestoreOffer(null);
  }, [presetId, playMode, placement, aiDifficulty, powerUpsEnabled]);

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setOnlineError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    });
  };

  const onStartClick = () => {
    const saved = readSavedGameFromStorage();
    if (
      saved &&
      savedGameMatchesSetup(saved, {
        presetId,
        playMode,
        placement,
        aiDifficulty,
        powerUpsEnabled,
      })
    ) {
      setRestoreOffer(saved);
      return;
    }
    startGame();
  };

  return (
    <div className="setup">
      <div className="setup__atmosphere" aria-hidden />
      <header className="setup__header">
        <div className="setup__brand-row">
          <p className="setup__brand">Voxel Toe</p>
          <p className="setup__version" aria-label={`Version ${formatAppVersionLabel()}`}>
            {formatAppVersionLabel()}
          </p>
        </div>
        <h1 className="setup__title">3D Tic-Tac-Toe</h1>
        <p className="setup__lede">
          Spin the cube. Drop or place marks. First to the line wins.
        </p>
      </header>

      <section className="setup__section" aria-label="Play mode">
        <h2 className="setup__label">Mode</h2>
        <div className="setup__modes setup__modes--three" role="group">
          {(
            [
              { id: "hotseat", label: "Hotseat" },
              { id: "ai", label: "vs AI" },
              { id: "online", label: "Online" },
            ] as const
          ).map((mode) => {
            const selected = playMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={`mode-chip${selected ? " is-selected" : ""}`}
                onClick={() => setPlayMode(mode.id as PlayMode)}
                aria-pressed={selected}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </section>

      {playMode === "online" ? (
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
      ) : null}

      <section className="setup__section" aria-label="Placement">
        <h2 className="setup__label">Placement{playMode === "online" ? " (host)" : ""}</h2>
        <div className="setup__modes setup__modes--two" role="group">
          {(
            [
              { id: "free", label: "Free", meta: "Place any empty cell" },
              { id: "drop", label: "Drop", meta: "Gravity · stack from the bottom" },
            ] as const
          ).map((opt) => {
            const selected = placement === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`mode-chip mode-chip--stack${selected ? " is-selected" : ""}`}
                onClick={() => setPlacement(opt.id as PlacementMode)}
                aria-pressed={selected}
              >
                <span className="mode-chip__label">{opt.label}</span>
                <span className="mode-chip__meta">{opt.meta}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="setup__section" aria-label="Board preset">
        <h2 className="setup__label">Preset{playMode === "online" ? " (host)" : ""}</h2>
        <div className="setup__presets">
          {PRESETS.map((preset) => {
            const selected = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                className={`preset-card${selected ? " is-selected" : ""}`}
                onClick={() => setPresetId(preset.id as PresetId)}
                aria-pressed={selected}
              >
                <span className="preset-card__name">{preset.label}</span>
                <span className="preset-card__meta">{preset.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {playMode !== "hotseat" ? (
        <section className="setup__section" aria-label="Power-ups">
          <h2 className="setup__label">Power-ups</h2>
          <div className="setup__modes setup__modes--two" role="group">
            {(
              [
                { id: true, label: "On", meta: "Catch packages for bonuses" },
                { id: false, label: "Off", meta: "Classic play only" },
              ] as const
            ).map((opt) => {
              const selected = powerUpsEnabled === opt.id;
              return (
                <button
                  key={String(opt.id)}
                  type="button"
                  className={`mode-chip mode-chip--stack${selected ? " is-selected" : ""}`}
                  onClick={() => setPowerUpsEnabled(opt.id)}
                  aria-pressed={selected}
                >
                  <span className="mode-chip__label">{opt.label}</span>
                  <span className="mode-chip__meta">{opt.meta}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {playMode === "ai" ? (
        <section className="setup__section" aria-label="AI difficulty">
          <h2 className="setup__label">Difficulty</h2>
          <div
            className={`setup__modes${isExtremeAllowed(presetId) ? "" : " setup__modes--three"}`}
            role="group"
          >
            {(
              [
                { id: "easy", label: "Easy" },
                { id: "medium", label: "Medium" },
                { id: "hard", label: "Hard" },
                ...(isExtremeAllowed(presetId)
                  ? [{ id: "extreme" as const, label: "Extreme" }]
                  : []),
                ...(isImpossibleAllowed(presetId)
                  ? [{ id: "impossible" as const, label: "Impossible" }]
                  : []),
              ] as const
            ).map((level) => {
              const selected = aiDifficulty === level.id;
              return (
                <button
                  key={level.id}
                  type="button"
                  className={`mode-chip${selected ? " is-selected" : ""}`}
                  onClick={() => setAiDifficulty(level.id as AiDifficulty)}
                  aria-pressed={selected}
                >
                  {level.label}
                </button>
              );
            })}
          </div>
          {aiDifficulty === "impossible" ? (
            <p className="setup__hint">Impossible plays Extreme’s game plus dual-force setups.</p>
          ) : aiDifficulty === "extreme" ? (
            <p className="setup__hint">Extreme blocks force traps and refuses to walk into them.</p>
          ) : isExtremeAllowed(presetId) ? (
            <p className="setup__hint">Impossible adds dual-force tactics on top of Extreme.</p>
          ) : null}
        </section>
      ) : null}

      {playMode === "online" ? (
        <>
          <section className="setup__section" aria-label="Join with code">
            <h2 className="setup__label">Join room</h2>
            <input
              className="setup__input"
              type="text"
              maxLength={8}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </section>
          {onlineError ? <p className="setup__error">{onlineError}</p> : null}
          <div className="setup__online-actions">
            <button
              type="button"
              className="setup__start"
              disabled={busy || pending}
              onClick={() =>
                run(async () => {
                  await createOnlineRoom(localName, presetId, placement);
                })
              }
            >
              Create room
            </button>
            <button
              type="button"
              className="setup__secondary"
              disabled={busy || pending}
              onClick={() =>
                run(async () => {
                  await joinOnlineRoom(joinCode, localName);
                })
              }
            >
              Join room
            </button>
          </div>
        </>
      ) : restoreOffer ? (
        <div className="setup__restore" role="dialog" aria-labelledby="restore-title">
          <div className="setup__restore-copy">
            <h2 id="restore-title" className="setup__restore-title">
              Resume game?
            </h2>
            <p className="setup__restore-detail">
              {restoreOffer.playMode === "ai"
                ? "Same grid and difficulty"
                : "Same setup"}{" "}
              — {restoreOffer.occupiedCount} mark
              {restoreOffer.occupiedCount === 1 ? "" : "s"} on the board.
            </p>
          </div>
          <div className="setup__restore-actions">
            <button
              type="button"
              className="setup__start"
              onClick={() => {
                const saved = restoreOffer;
                setRestoreOffer(null);
                restoreGame(saved);
              }}
            >
              Restore
            </button>
            <button
              type="button"
              className="setup__secondary"
              onClick={() => {
                setRestoreOffer(null);
                startGame();
              }}
            >
              New game
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="setup__start" onClick={onStartClick}>
          Start game
        </button>
      )}

      <section className="setup__section setup__section--help" aria-label="Help">
        <button
          type="button"
          className="setup__link"
          onClick={() => setOnboardingOpen(true)}
          disabled={!onboardingReady}
        >
          How to play
        </button>
      </section>

      <OnboardingOverlay open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  );
}
