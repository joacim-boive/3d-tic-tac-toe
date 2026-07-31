"use client";

import { useEffect, useState, useTransition } from "react";
import { PRESETS } from "@/game/presets";
import { hydrateLocalNameFromStorage, useGameStore } from "@/game/store";
import type { AiDifficulty, PlacementMode, PlayMode, PresetId } from "@/game/types";
import { createOnlineRoom, joinOnlineRoom } from "@/online/session";

export function SetupScreen() {
  const presetId = useGameStore((s) => s.presetId);
  const playMode = useGameStore((s) => s.playMode);
  const placement = useGameStore((s) => s.placement);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const localName = useGameStore((s) => s.localName);
  const onlineError = useGameStore((s) => s.onlineError);
  const setPresetId = useGameStore((s) => s.setPresetId);
  const setPlayMode = useGameStore((s) => s.setPlayMode);
  const setPlacement = useGameStore((s) => s.setPlacement);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);
  const setLocalName = useGameStore((s) => s.setLocalName);
  const setOnlineError = useGameStore((s) => s.setOnlineError);
  const startGame = useGameStore((s) => s.startGame);

  const [joinCode, setJoinCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hydrateLocalNameFromStorage();
  }, []);

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

  return (
    <div className="setup">
      <div className="setup__atmosphere" aria-hidden />
      <header className="setup__header">
        <p className="setup__brand">Voxel Toe</p>
        <h1 className="setup__title">3D Tic-Tac-Toe</h1>
        <p className="setup__lede">
          Spin the cube. Drop or place coral and cyan. First to the line wins.
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

      {playMode === "ai" ? (
        <section className="setup__section" aria-label="AI difficulty">
          <h2 className="setup__label">Difficulty</h2>
          <div className="setup__modes setup__modes--three" role="group">
            {(
              [
                { id: "easy", label: "Easy" },
                { id: "medium", label: "Medium" },
                { id: "hard", label: "Hard" },
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
      ) : (
        <button type="button" className="setup__start" onClick={startGame}>
          Start game
        </button>
      )}
    </div>
  );
}
