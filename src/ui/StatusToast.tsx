"use client";

import { useEffect, useState, type CSSProperties } from "react";

type StatusToastProps = {
  message: string;
  /** Player turn color for the leading dot; omit for neutral notices. */
  turnColor?: string;
  /** Sticky messages (e.g. reconnect) stay until the message changes. */
  sticky?: boolean;
};

const TOAST_MS = 2400;

/**
 * Transient chrome status — replaces the old always-on "X to drop" row
 * so the top bar can stay a single line of coords + actions.
 */
export function StatusToast({ message, turnColor, sticky = false }: StatusToastProps) {
  const [visible, setVisible] = useState(message);

  useEffect(() => {
    setVisible(message);
    if (sticky || !message) return;
    const t = window.setTimeout(() => setVisible(""), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [message, sticky]);

  if (!visible) return null;

  return (
    <p
      className="status-toast"
      role="status"
      aria-live="polite"
      style={turnColor ? ({ ["--turn"]: turnColor } as CSSProperties) : undefined}
    >
      {turnColor ? <span className="status-toast__dot" aria-hidden /> : null}
      <span>{visible}</span>
    </p>
  );
}
