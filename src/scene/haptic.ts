/** Felt pulse on Android Vibration API (values under ~10ms are often ignored). */
const DEPTH_STEP_MS = 25;

/** Native switch size used by WebKit’s haptic tick (scaled down to sit under a finger). */
const SWITCH_SCALE = 0.4;
const SWITCH_W = 70 * SWITCH_SCALE;
const SWITCH_H = 31 * SWITCH_SCALE;

type VibrateNav = {
  vibrate?: (pattern: number | number[]) => boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

export type DepthHapticHost = {
  vibrate?: (pattern: number | number[]) => boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

function defaultNav(): VibrateNav | undefined {
  return typeof navigator !== "undefined" ? navigator : undefined;
}

export function canVibrate(nav: VibrateNav | null | undefined = defaultNav()): boolean {
  return typeof nav?.vibrate === "function";
}

/** iPhone / iPad / iPod — including iPadOS desktop UA with touch. */
export function isAppleTouchDevice(nav: DepthHapticHost | null | undefined = defaultNav()): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ can report as MacIntel with touch.
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Prefer the WebKit switch trick when the Vibration API is missing (iOS)
 * or when we’re on an Apple touch device (Chrome/Firefox iOS also lack vibrate).
 */
export function needsSwitchHaptic(nav: DepthHapticHost | null | undefined = defaultNav()): boolean {
  if (isAppleTouchDevice(nav)) return true;
  return !canVibrate(nav);
}

type SwitchLayer = {
  root: HTMLDivElement;
  clip: HTMLDivElement;
  input: HTMLInputElement;
};

let layer: SwitchLayer | null = null;
let primed = false;
let flipped = false;
let startX = 0;
let startY = 0;
let curX = 0;
let curY = 0;
/** Pointers currently captured onto the WebKit switch. */
const capturedIds = new Set<number>();
/** When true, next layout flip should place the switch under the finger for a tick. */
let tickPending = false;

function ensureSwitchLayer(): SwitchLayer | null {
  if (typeof document === "undefined") return null;
  if (layer) return layer;

  const root = document.createElement("div");
  root.setAttribute("data-depth-haptic", "");
  root.setAttribute(
    "style",
    [
      "all: unset",
      "position: fixed",
      "inset: 0",
      "z-index: 2147483646",
      "pointer-events: none",
      "overflow: hidden",
    ].join(";"),
  );

  const clip = document.createElement("div");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.setAttribute(
    "style",
    [
      "all: revert",
      "position: absolute",
      "width: 100%",
      "height: 100%",
      "top: 50%",
      "left: 50%",
      "transform: translate(-50%, -50%)",
      "touch-action: none",
      "margin: 0",
    ].join(";"),
  );

  clip.appendChild(input);
  root.appendChild(clip);
  document.body.appendChild(root);
  layer = { root, clip, input };
  return layer;
}

function layoutSwitch(vibrate: boolean): void {
  const current = layer;
  if (!current || !primed) return;

  const top = (vibrate ? startY : curY) - SWITCH_H / 2;
  const left = (vibrate ? startX : curX) - SWITCH_W / 2;
  const deltaX = curX - startX;
  const deltaY = curY - startY;
  const angleDeg = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  const angleDeg360 = ((angleDeg % 360) + 360) % 360;

  current.clip.setAttribute(
    "style",
    [
      "all: unset",
      "position: absolute",
      "overflow: hidden",
      `height: ${SWITCH_H}px`,
      `width: ${SWITCH_W}px`,
      "top: 0",
      "left: 0",
      "pointer-events: auto",
      `direction: ${!vibrate || flipped ? "rtl" : "ltr"}`,
      `transform: translate(${left}px, ${top}px) rotate(${angleDeg360}deg) translateX(${vibrate ? 0 : 50}px)`,
      "opacity: 0",
    ].join(";"),
  );
  // Force layout so WebKit hit-tests the new direction during this pointermove.
  void current.clip.offsetWidth;
}

/**
 * Capture active pointers onto the WebKit switch so finger moves can produce
 * system haptics. No-op on Android (Vibration API path).
 */
export function primeDepthHaptic(
  clientX: number,
  clientY: number,
  pointerIds: Iterable<number>,
  nav: DepthHapticHost | null | undefined = defaultNav(),
): void {
  if (!needsSwitchHaptic(nav)) return;
  const current = ensureSwitchLayer();
  if (!current) return;

  primed = true;
  flipped = false;
  tickPending = false;
  startX = clientX;
  startY = clientY;
  curX = clientX;
  curY = clientY;
  layoutSwitch(false);

  for (const id of pointerIds) {
    try {
      current.input.setPointerCapture(id);
      capturedIds.add(id);
    } catch {
      // Pointer may already be up or not capturable — ignore.
    }
  }
}

/** Keep the switch under the gesture while three-finger depth is active. */
export function moveDepthHaptic(clientX: number, clientY: number): void {
  if (!primed) return;
  curX = clientX;
  curY = clientY;
  if (tickPending) {
    flipped = !flipped;
    tickPending = false;
    layoutSwitch(true);
    return;
  }
  layoutSwitch(false);
}

export function releaseDepthHaptic(): void {
  const current = layer;
  primed = false;
  tickPending = false;
  flipped = false;
  if (current) {
    for (const id of capturedIds) {
      try {
        if (current.input.hasPointerCapture(id)) {
          current.input.releasePointerCapture(id);
        }
      } catch {
        // ignore
      }
    }
    current.input.checked = false;
    current.clip.setAttribute(
      "style",
      "all: unset; position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none;",
    );
  }
  capturedIds.clear();
}

/**
 * Subtle haptic tick for a depth-layer step.
 * Android: Vibration API. iOS: WebKit switch flip under the captured finger.
 */
export function hapticDepthStep(nav: DepthHapticHost | null | undefined = defaultNav()): void {
  if (!needsSwitchHaptic(nav) && canVibrate(nav) && nav?.vibrate) {
    try {
      nav.vibrate(DEPTH_STEP_MS);
    } catch {
      // ignored — some browsers throw when vibration is blocked
    }
    return;
  }

  if (!primed) return;
  // Flip synchronously during the active pointermove (capture phase) so WebKit
  // hit-tests the switch under the finger with the new direction.
  flipped = !flipped;
  tickPending = false;
  layoutSwitch(true);
}
