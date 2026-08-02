/** Felt pulse on Android Vibration API (values under ~10ms are often ignored). */
export const DEPTH_STEP_MS = 25;

/** Match SelectionCursor’s three-finger pixels-per-layer. */
export const DEPTH_HAPTIC_PX_PER_STEP = 48;

export const DEPTH_HAPTIC_GRID_ATTR = "data-depth-haptic-grid";
export const DEPTH_HAPTIC_CELL_ATTR = "data-depth-haptic-cell";

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
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Use the WebKit switch grid when Vibration API is missing (iOS) or on Apple touch
 * (Chrome/Firefox iOS also lack vibrate).
 */
export function needsSwitchHaptic(nav: DepthHapticHost | null | undefined = defaultNav()): boolean {
  if (isAppleTouchDevice(nav)) return true;
  return !canVibrate(nav);
}

type ArmedSwitch = {
  input: HTMLInputElement;
  anchorX: number;
  anchorY: number;
  /** Restored when depth gesture ends. */
  previousStyle: string;
};

const armed = new Map<HTMLInputElement, ArmedSwitch>();
let flip = false;

function isHapticCell(el: EventTarget | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    el.type === "checkbox" &&
    el.hasAttribute("switch") &&
    el.hasAttribute(DEPTH_HAPTIC_CELL_ATTR)
  );
}

function layoutArmedSwitch(
  input: HTMLInputElement,
  clientX: number,
  clientY: number,
  rtl: boolean,
): void {
  const track = DEPTH_HAPTIC_PX_PER_STEP * 2;
  const thumb = 44;
  // Park the track so the finger sits just before the midpoint. The next
  // ~TRI_SWIPE_PX of vertical travel crosses it → PointerTracking haptic.
  // Do NOT move the switch with the finger — relative motion is required.
  const top = clientY - DEPTH_HAPTIC_PX_PER_STEP;
  const left = clientX - thumb / 2;
  input.setAttribute(
    "style",
    [
      "position: fixed",
      `top: ${top}px`,
      `left: ${left}px`,
      `width: ${thumb}px`,
      `height: ${track}px`,
      "margin: 0",
      "opacity: 0",
      "z-index: 2147483646",
      "touch-action: none",
      "pointer-events: auto",
      "writing-mode: vertical-rl",
      `direction: ${rtl ? "rtl" : "ltr"}`,
    ].join(";"),
  );
}

/**
 * WebKit only starts switch pointer-tracking when a touchstart has exactly one
 * target touch on that control. A tiled grid gives each finger its own switch.
 * Programmatic .click() does not haptic; flipping `direction` during a real
 * drag makes the thumb midpoint cross under the finger again.
 */
export function armDepthHapticSwitches(
  points: ReadonlyArray<{ x: number; y: number }>,
  nav: DepthHapticHost | null | undefined = defaultNav(),
): void {
  if (!needsSwitchHaptic(nav) || typeof document === "undefined") return;

  const seen = new Set<HTMLInputElement>();
  for (const point of points) {
    const hit = document.elementFromPoint(point.x, point.y);
    if (!isHapticCell(hit) || seen.has(hit)) continue;
    seen.add(hit);
    if (armed.has(hit)) continue;

    armed.set(hit, {
      input: hit,
      anchorX: point.x,
      anchorY: point.y,
      previousStyle: hit.getAttribute("style") ?? "",
    });
    layoutArmedSwitch(hit, point.x, point.y, flip);
  }
}

export function releaseDepthHapticSwitches(): void {
  for (const { input, previousStyle } of armed.values()) {
    if (previousStyle) input.setAttribute("style", previousStyle);
    else input.removeAttribute("style");
    input.checked = false;
    input.disabled = false;
  }
  armed.clear();
  flip = false;
}

/**
 * Depth layer changed: Android vibrates; iOS flips armed switch direction so the
 * user's ongoing finger drag crosses the native thumb midpoint again.
 */
export function hapticDepthStep(nav: DepthHapticHost | null | undefined = defaultNav()): void {
  if (!needsSwitchHaptic(nav) && canVibrate(nav) && nav?.vibrate) {
    try {
      nav.vibrate(DEPTH_STEP_MS);
    } catch {
      // ignored
    }
    return;
  }

  if (armed.size === 0) return;
  flip = !flip;
  for (const entry of armed.values()) {
    layoutArmedSwitch(entry.input, entry.anchorX, entry.anchorY, flip);
  }
}

/**
 * Block the touchend→click haptic when the cell is not armed for depth.
 * Must run in capture phase before WebKit’s switch handler.
 */
export function suppressUnarmedSwitchClick(event: TouchEvent): void {
  if (!isHapticCell(event.target)) return;
  if (armed.has(event.target)) return;
  event.target.disabled = true;
  const input = event.target;
  requestAnimationFrame(() => {
    input.disabled = false;
  });
}
