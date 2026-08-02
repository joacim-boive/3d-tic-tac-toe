"use client";

import { useEffect, useState } from "react";
import type { AppVersionInfo } from "@/appVersion";
import { applyAppUpgrade, checkHomeScreenUpgrade } from "@/ui/appUpdate";

/**
 * Home-screen (standalone) shells can keep a stale JS bundle after deploy.
 * Poll the live version and offer a hard reload when the bookmark is behind.
 */
export function AppUpdateBanner() {
  const [remote, setRemote] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const next = await checkHomeScreenUpgrade();
      if (!cancelled) setRemote(next);
    };

    void run();

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  if (!remote) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner__copy">
        <p className="update-banner__title">Update available</p>
        <p className="update-banner__detail">
          A newer Voxel Toe (v{remote.version}) is ready. Upgrade to stay current.
        </p>
      </div>
      <button
        type="button"
        className="update-banner__action"
        onClick={() => applyAppUpgrade(remote)}
      >
        Upgrade
      </button>
    </div>
  );
}
