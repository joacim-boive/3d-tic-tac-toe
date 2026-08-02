import { localAppVersion, needsAppUpgrade, type AppVersionInfo } from "@/appVersion";

/** iOS Add-to-Home-Screen and installed PWAs (display-mode standalone). */
export function isHomeScreenApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

export async function fetchLiveAppVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<AppVersionInfo | null> {
  try {
    const res = await fetchImpl("/api/version", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as { version?: unknown }).version !== "string" ||
      typeof (data as { buildId?: unknown }).buildId !== "string"
    ) {
      return null;
    }
    return {
      version: (data as { version: string }).version,
      buildId: (data as { buildId: string }).buildId,
    };
  } catch {
    return null;
  }
}

/**
 * When launched from a home-screen bookmark, compare the bundled build to
 * the live deploy. Returns the newer remote info when an upgrade is needed.
 */
export async function checkHomeScreenUpgrade(
  options: {
    fetchImpl?: typeof fetch;
    isHomeScreen?: () => boolean;
    local?: AppVersionInfo;
  } = {},
): Promise<AppVersionInfo | null> {
  const isHome = options.isHomeScreen ?? isHomeScreenApp;
  if (!isHome()) return null;

  const remote = await fetchLiveAppVersion(options.fetchImpl);
  if (!remote) return null;

  const local = options.local ?? localAppVersion();
  return needsAppUpgrade(local, remote) ? remote : null;
}

/** Hard-navigate with a cache-busting query so the home-screen shell reloads. */
export function applyAppUpgrade(remote: AppVersionInfo): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_app", remote.buildId);
  window.location.replace(url.toString());
}
