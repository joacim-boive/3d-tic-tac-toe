"use client";

import { PRESETS } from "@/game/presets";
import { useGameStore } from "@/game/store";
import type { AiDifficulty, PlayMode, PresetId } from "@/game/types";

export function SetupScreen() {
  const presetId = useGameStore((s) => s.presetId);
  const playMode = useGameStore((s) => s.playMode);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const setPresetId = useGameStore((s) => s.setPresetId);
  const setPlayMode = useGameStore((s) => s.setPlayMode);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);
  const startGame = useGameStore((s) => s.startGame);

  return (
    <div className="setup">
      <div className="setup__atmosphere" aria-hidden />
      <header className="setup__header">
        <p className="setup__brand">Voxel Toe</p>
        <h1 className="setup__title">3D Tic-Tac-Toe</h1>
        <p className="setup__lede">Spin the cube. Place coral and cyan. First to the line wins.</p>
      </header>

      <section className="setup__section" aria-label="Board preset">
        <h2 className="setup__label">Preset</h2>
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

      <section className="setup__section" aria-label="Play mode">
        <h2 className="setup__label">Mode</h2>
        <div className="setup__modes" role="group">
          {(
            [
              { id: "hotseat", label: "Hotseat" },
              { id: "ai", label: "vs AI" },
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

      <button type="button" className="setup__start" onClick={startGame}>
        Start game
      </button>
    </div>
  );
}
