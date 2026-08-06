/**
 * Regression: bottom Extra/Clear/Tip inventory must stay visible for vs AI /
 * Online when power-ups are on. Hotseat / power-ups-off hide it on purpose.
 *
 * Run with `npm run check:powerup-hud`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayMode } from "@/game/types";
import { shouldShowPowerUpHud } from "./powerUpHudVisibility";

const MODES: readonly PlayMode[] = ["hotseat", "ai", "online"];
const here = dirname(fileURLToPath(import.meta.url));

function testShowsForAiAndOnlineWhenEnabled() {
  for (const playMode of ["ai", "online"] as const) {
    assert.equal(
      shouldShowPowerUpHud({ powerUpsEnabled: true, playMode }),
      true,
      `${playMode} + power-ups on → show HUD`,
    );
  }
}

function testHiddenWhenPowerUpsOff() {
  for (const playMode of MODES) {
    assert.equal(
      shouldShowPowerUpHud({ powerUpsEnabled: false, playMode }),
      false,
      `${playMode} + power-ups off → hide HUD`,
    );
  }
}

function testHiddenForHotseatEvenIfEnabled() {
  assert.equal(
    shouldShowPowerUpHud({ powerUpsEnabled: true, playMode: "hotseat" }),
    false,
    "hotseat never shows power-up HUD",
  );
}

function testMatrix() {
  const expected: Record<PlayMode, { on: boolean; off: boolean }> = {
    hotseat: { on: false, off: false },
    ai: { on: true, off: false },
    online: { on: true, off: false },
  };
  for (const playMode of MODES) {
    assert.equal(
      shouldShowPowerUpHud({ powerUpsEnabled: true, playMode }),
      expected[playMode].on,
      `matrix ${playMode}/on`,
    );
    assert.equal(
      shouldShowPowerUpHud({ powerUpsEnabled: false, playMode }),
      expected[playMode].off,
      `matrix ${playMode}/off`,
    );
  }
}

/** Guard against accidentally dropping <PowerUpHud /> from the game shell. */
function testMountedInGameChrome() {
  const chrome = readFileSync(join(here, "GameChrome.tsx"), "utf8");
  assert.match(chrome, /import\s+\{\s*PowerUpHud\s*\}\s+from\s+"\.\/PowerUpHud"/, "import");
  assert.match(chrome, /<PowerUpHud\s*\/>/, "render");
}

/** Inventory rows render Extra / Clear / Tip chips for both seats when shown. */
function testHudRendersBothInventories() {
  const hud = readFileSync(join(here, "PowerUpHud.tsx"), "utf8");
  assert.match(hud, /shouldShowPowerUpHud\(\{\s*powerUpsEnabled,\s*playMode\s*\}\)/, "gate");
  assert.match(hud, /<InventoryRow\s+player="a"/, "seat a");
  assert.match(hud, /<InventoryRow\s+player="b"/, "seat b");
  assert.match(hud, /className=\{`powerups__row/, "row class");
  assert.match(hud, /className="powerups__chips"/, "chips");
}

testShowsForAiAndOnlineWhenEnabled();
testHiddenWhenPowerUpsOff();
testHiddenForHotseatEvenIfEnabled();
testMatrix();
testMountedInGameChrome();
testHudRendersBothInventories();
console.log("powerUpHudVisibility.selftest ok");
