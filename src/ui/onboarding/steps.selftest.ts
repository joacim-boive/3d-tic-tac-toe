/**
 * Assert-based self-check for onboarding step copy — `npm run check:onboarding`.
 */
import { onboardingSteps, type OnboardingStepId } from "./steps";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const EXPECTED_IDS: readonly OnboardingStepId[] = [
  "welcome",
  "orbit",
  "aim",
  "place",
  "depth",
  "catch",
  "use",
  "ready",
];

function testStepIds(touchUi: boolean) {
  const steps = onboardingSteps(touchUi);
  assert(steps.length === EXPECTED_IDS.length, `${touchUi ? "touch" : "desk"} length`);
  for (let i = 0; i < EXPECTED_IDS.length; i++) {
    assert(steps[i]?.id === EXPECTED_IDS[i], `${touchUi ? "touch" : "desk"} id ${i}`);
    assert(Boolean(steps[i]?.title.trim()), `title ${i}`);
    assert(Boolean(steps[i]?.body.trim()), `body ${i}`);
  }
}

function testDeviceCopyDiffers() {
  const touch = onboardingSteps(true);
  const desk = onboardingSteps(false);
  const orbitTouch = touch.find((s) => s.id === "orbit")!;
  const orbitDesk = desk.find((s) => s.id === "orbit")!;
  assert(orbitTouch.body !== orbitDesk.body, "orbit copy differs by device");
  assert(orbitTouch.body.toLowerCase().includes("two finger"), "touch mentions two fingers");
  assert(
    orbitDesk.body.toLowerCase().includes("trackpad") || orbitDesk.body.toLowerCase().includes("scroll"),
    "desktop mentions trackpad/scroll",
  );

  const depthTouch = touch.find((s) => s.id === "depth")!;
  const depthDesk = desk.find((s) => s.id === "depth")!;
  assert(depthTouch.body !== depthDesk.body, "depth copy differs");
  assert(depthDesk.body.includes("Shift") || depthDesk.body.includes("Q"), "desktop depth keys");
}

testStepIds(true);
testStepIds(false);
testDeviceCopyDiffers();
console.log("onboarding steps ok");
