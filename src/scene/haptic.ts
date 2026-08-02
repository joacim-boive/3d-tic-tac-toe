/** Short pulse when the sticky depth layer changes (3-finger swipe). */
const DEPTH_STEP_MS = 14;

type VibrateNav = {
  vibrate?: (pattern: number | number[]) => boolean;
};

function defaultNav(): VibrateNav | undefined {
  return typeof navigator !== "undefined" ? navigator : undefined;
}

export function canVibrate(nav: VibrateNav | null | undefined = defaultNav()): boolean {
  return typeof nav?.vibrate === "function";
}

/**
 * Subtle haptic tick for a depth-layer step.
 * No-op when the Vibration API is missing or blocked (e.g. iOS Safari).
 */
export function hapticDepthStep(nav: VibrateNav | null | undefined = defaultNav()): void {
  if (!canVibrate(nav) || !nav?.vibrate) return;
  try {
    nav.vibrate(DEPTH_STEP_MS);
  } catch {
    // ignored — some browsers throw when vibration is blocked
  }
}
