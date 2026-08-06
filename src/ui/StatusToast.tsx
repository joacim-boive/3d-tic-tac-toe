"use client";

import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties } from "react";

type StatusToastProps = {
  message: string;
  /** Player turn color for the leading dot; omit for neutral notices. */
  turnColor?: string;
  /** Sticky messages (e.g. reconnect) stay until the message changes. */
  sticky?: boolean;
};

type ToastPhase = "in" | "shown" | "out";

const HOLD_MS = 2200;

/**
 * Transient chrome status — replaces the old always-on "X to drop" row
 * so the top bar can stay a single line of coords + actions.
 */
export function StatusToast({ message, turnColor, sticky = false }: StatusToastProps) {
  const [display, setDisplay] = useState(message);
  const [phase, setPhase] = useState<ToastPhase | "hidden">(message ? "in" : "hidden");
  const holdTimer = useRef<number | null>(null);
  const turnStyle = turnColor ? ({ ["--turn"]: turnColor } as CSSProperties) : undefined;

  useEffect(() => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }

    if (!message) {
      setPhase((prev) => (prev === "hidden" ? "hidden" : "out"));
      return;
    }

    setDisplay(message);
    setPhase("in");

    if (sticky) return;

    holdTimer.current = window.setTimeout(() => {
      setPhase("out");
      holdTimer.current = null;
    }, HOLD_MS);

    return () => {
      if (holdTimer.current != null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, [message, sticky]);

  const onAnimationEnd = (event: AnimationEvent<HTMLParagraphElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === "in") {
      setPhase("shown");
      return;
    }
    if (phase === "out") {
      setPhase("hidden");
      if (!message) setDisplay("");
    }
  };

  if (phase === "hidden" || !display) return null;

  const motionClass =
    phase === "out" ? " status-toast--out" : phase === "in" ? " status-toast--in" : "";

  return (
    <p
      key={display}
      className={`status-toast${motionClass}`}
      role="status"
      aria-live="polite"
      style={turnStyle}
      onAnimationEnd={onAnimationEnd}
    >
      {turnColor ? <span className="status-toast__dot" aria-hidden /> : null}
      <span>{display}</span>
    </p>
  );
}
