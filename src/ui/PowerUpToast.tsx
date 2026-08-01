"use client";

import { useEffect } from "react";
import { useGameStore } from "@/game/store";

/**
 * Floating opponent power-up notice inside the viewport —
 * absolute so chrome / inventory layout never shifts.
 */
export function PowerUpToast() {
  const toast = useGameStore((s) => s.powerUpToast);
  const clearPowerUpToast = useGameStore((s) => s.clearPowerUpToast);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => clearPowerUpToast(), 2800);
    return () => window.clearTimeout(t);
  }, [toast, clearPowerUpToast]);

  if (!toast) return null;

  return (
    <p className="powerup-toast" role="status">
      {toast}
    </p>
  );
}
