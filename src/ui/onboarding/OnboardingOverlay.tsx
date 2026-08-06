"use client";

import { useEffect, useId, useState } from "react";
import { markOnboardingComplete } from "@/game/onboardingPrefs";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { onboardingSteps } from "./steps";

type OnboardingOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export function OnboardingOverlay({ open, onClose }: OnboardingOverlayProps) {
  const touchUi = useCoarsePointer();
  const steps = onboardingSteps(touchUi);
  const [index, setIndex] = useState(0);
  const titleId = useId();
  const step = steps[Math.min(index, steps.length - 1)]!;
  const isLast = index >= steps.length - 1;
  const progress = ((index + 1) / steps.length) * 100;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open, touchUi]);

  useEffect(() => {
    if (!open) return;

    const complete = () => {
      markOnboardingComplete();
      onClose();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        complete();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((i) => {
          if (i >= steps.length - 1) {
            complete();
            return i;
          }
          return i + 1;
        });
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  const finish = () => {
    markOnboardingComplete();
    onClose();
  };

  const advance = () => {
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  if (!open) return null;

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="onboard__backdrop" aria-hidden />
      <div className="onboard__panel">
        <div className="onboard__progress" aria-hidden>
          <span className="onboard__progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <header className="onboard__header">
          <p className="onboard__eyebrow">
            {touchUi ? "Touch" : "Desktop"} · {index + 1}/{steps.length}
          </p>
          <h2 id={titleId} className="onboard__title">
            {step.title}
          </h2>
          <p className="onboard__body">{step.body}</p>
        </header>

        <div className="onboard__visual" key={`${step.id}-${touchUi ? "touch" : "desk"}`}>
          <OnboardingIllustration stepId={step.id} touchUi={touchUi} />
        </div>

        <footer className="onboard__footer">
          <button type="button" className="onboard__skip" onClick={finish}>
            Skip
          </button>
          <div className="onboard__nav">
            {index > 0 ? (
              <button
                type="button"
                className="setup__secondary onboard__back"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
            ) : null}
            <button type="button" className="setup__start onboard__next" onClick={advance}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
