"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { markOnboardingComplete } from "@/game/onboardingPrefs";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { onboardingSteps } from "./steps";

type OnboardingOverlayProps = {
  open: boolean;
  onClose: () => void;
};

type SwipeSession = {
  pointerId: number;
  x: number;
  y: number;
};

/** Horizontal pixels needed to change step (must also beat vertical). */
const SWIPE_STEP_PX = 56;

function isSwipeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest("button, a, input, textarea, select, [data-no-swipe]"));
}

export function OnboardingOverlay({ open, onClose }: OnboardingOverlayProps) {
  const touchUi = useCoarsePointer();
  const steps = onboardingSteps(touchUi);
  const [index, setIndex] = useState(0);
  const titleId = useId();
  const swipeRef = useRef<SwipeSession | null>(null);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const isLast = index >= steps.length - 1;
  const progress = ((index + 1) / steps.length) * 100;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    swipeRef.current = null;
  }, [open, touchUi]);

  const finish = () => {
    markOnboardingComplete();
    onClose();
  };

  const goBack = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  const advance = () => {
    let shouldFinish = false;
    setIndex((i) => {
      if (i >= steps.length - 1) {
        shouldFinish = true;
        return i;
      }
      return i + 1;
    });
    if (shouldFinish) finish();
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        markOnboardingComplete();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        let shouldFinish = false;
        setIndex((i) => {
          if (i >= steps.length - 1) {
            shouldFinish = true;
            return i;
          }
          return i + 1;
        });
        if (shouldFinish) {
          markOnboardingComplete();
          onClose();
        }
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  const onSwipePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isSwipeBlockedTarget(event.target)) return;
    // Interactive demos own their pointers (orbit pinch, etc.).
    if (
      event.target instanceof Element &&
      event.target.closest(".onboard-demo__stage--interactive")
    ) {
      return;
    }
    swipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = swipeRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const dx = event.clientX - session.x;
    const dy = event.clientY - session.y;
    if (Math.abs(dx) < SWIPE_STEP_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.15) return;

    // Swipe left → next; swipe right → back.
    if (dx < 0) advance();
    else goBack();
  };

  const onSwipePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = swipeRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    swipeRef.current = null;
  };

  if (!open) return null;

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="onboard__backdrop" aria-hidden />
      <div
        className="onboard__panel"
        onPointerDown={onSwipePointerDown}
        onPointerUp={endSwipe}
        onPointerCancel={onSwipePointerCancel}
      >
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
              <button type="button" className="setup__secondary onboard__back" onClick={goBack}>
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
