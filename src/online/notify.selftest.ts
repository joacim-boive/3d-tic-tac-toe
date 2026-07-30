import assert from "node:assert/strict";
import { shouldShowOpponentNotify } from "./notify";

assert.equal(
  shouldShowOpponentNotify({
    permission: "granted",
    visibilityState: "hidden",
    hasFocus: false,
  }),
  true,
);

assert.equal(
  shouldShowOpponentNotify({
    permission: "granted",
    visibilityState: "visible",
    hasFocus: true,
  }),
  false,
);

assert.equal(
  shouldShowOpponentNotify({
    permission: "denied",
    visibilityState: "hidden",
    hasFocus: false,
  }),
  false,
);

assert.equal(
  shouldShowOpponentNotify({
    permission: "unsupported",
    visibilityState: "hidden",
    hasFocus: false,
  }),
  false,
);

assert.equal(
  shouldShowOpponentNotify({
    permission: "granted",
    visibilityState: "visible",
    hasFocus: false,
  }),
  true,
);

console.log("notify.selftest: ok");
