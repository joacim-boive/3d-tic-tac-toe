import assert from "node:assert/strict";
import { formatAppVersionLabel, needsAppUpgrade, type AppVersionInfo } from "../appVersion";
import { checkHomeScreenUpgrade, fetchLiveAppVersion } from "./appUpdate";

function info(version: string, buildId: string): AppVersionInfo {
  return { version, buildId };
}

async function main() {
  assert.equal(formatAppVersionLabel(info("0.1.0", "abc")), "v0.1.0");
  assert.equal(needsAppUpgrade(info("0.1.0", "aaa"), info("0.1.0", "aaa")), false);
  assert.equal(needsAppUpgrade(info("0.1.0", "aaa"), info("0.1.0", "bbb")), true);
  assert.equal(needsAppUpgrade(info("0.1.0", "aaa"), info("0.2.0", "aaa")), true);

  {
    const remote = info("0.2.0", "new");
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(remote), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const live = await fetchLiveAppVersion(fetchImpl);
    assert.deepEqual(live, remote);
  }

  {
    const fetchImpl: typeof fetch = async () => new Response("nope", { status: 503 });
    assert.equal(await fetchLiveAppVersion(fetchImpl), null);
  }

  {
    const remote = info("0.2.0", "new");
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(remote), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const upgrade = await checkHomeScreenUpgrade({
      fetchImpl,
      isHomeScreen: () => true,
      local: info("0.1.0", "old"),
    });
    assert.deepEqual(upgrade, remote);
  }

  {
    const remote = info("0.1.0", "same");
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(remote), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const upgrade = await checkHomeScreenUpgrade({
      fetchImpl,
      isHomeScreen: () => true,
      local: info("0.1.0", "same"),
    });
    assert.equal(upgrade, null);
  }

  {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("should not fetch outside home screen");
    };
    const upgrade = await checkHomeScreenUpgrade({
      fetchImpl,
      isHomeScreen: () => false,
      local: info("0.1.0", "old"),
    });
    assert.equal(upgrade, null);
  }

  console.log("appUpdate.selftest: ok");
}

void main();
