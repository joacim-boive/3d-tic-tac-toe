/** Semver from package.json, inlined at build via next.config `env`. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/**
 * Deploy fingerprint (git SHA short or "dev"). Changes every production
 * deploy so home-screen bookmarks can detect a stale cached shell.
 */
export const APP_BUILD_ID = process.env.NEXT_PUBLIC_APP_BUILD_ID ?? "dev";

export type AppVersionInfo = {
  version: string;
  buildId: string;
};

export function localAppVersion(): AppVersionInfo {
  return { version: APP_VERSION, buildId: APP_BUILD_ID };
}

export function formatAppVersionLabel(info: AppVersionInfo = localAppVersion()): string {
  return `v${info.version}`;
}

/** True when the running client is behind the live deploy. */
export function needsAppUpgrade(local: AppVersionInfo, remote: AppVersionInfo): boolean {
  return local.buildId !== remote.buildId || local.version !== remote.version;
}
