/** Persisted first-run / replay onboarding state (not shareable URL prefs). */

export const LOCAL_ONBOARDING_PREFS_KEY = "voxel-toe-onboarding";

/**
 * Bump when control copy or steps change enough that returning players
 * should see the walkthrough again on next launch.
 */
export const ONBOARDING_VERSION = 1;

export type OnboardingPrefs = {
  /** Last completed (or skipped) onboarding content version. */
  completedVersion: number;
};

export function parseOnboardingPrefs(raw: unknown): Partial<OnboardingPrefs> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: Partial<OnboardingPrefs> = {};
  if (typeof obj.completedVersion === "number" && Number.isFinite(obj.completedVersion)) {
    out.completedVersion = Math.max(0, Math.floor(obj.completedVersion));
  }
  return out;
}

export function hasCompletedOnboarding(prefs: Partial<OnboardingPrefs>): boolean {
  return (prefs.completedVersion ?? 0) >= ONBOARDING_VERSION;
}

export function readOnboardingPrefsFromStorage(): Partial<OnboardingPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_ONBOARDING_PREFS_KEY);
    if (!raw) return {};
    return parseOnboardingPrefs(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function writeOnboardingPrefsToStorage(prefs: OnboardingPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_ONBOARDING_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / quota
  }
}

export function markOnboardingComplete(): void {
  writeOnboardingPrefsToStorage({ completedVersion: ONBOARDING_VERSION });
}

export function shouldShowOnboardingOnLaunch(): boolean {
  return !hasCompletedOnboarding(readOnboardingPrefsFromStorage());
}
