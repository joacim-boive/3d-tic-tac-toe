"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { OnboardingStepId } from "./steps";

type DemoProps = {
  touchUi: boolean;
};

function VoxelCube({
  rotX,
  rotY,
  scale = 1,
  spinning = false,
  showCursor = false,
}: {
  rotX?: number;
  rotY?: number;
  scale?: number;
  spinning?: boolean;
  showCursor?: boolean;
}) {
  const style =
    rotX != null && rotY != null
      ? { transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})` }
      : scale !== 1
        ? { transform: `rotateX(-22deg) rotateY(32deg) scale(${scale})` }
        : undefined;

  return (
    <div
      className={`onboard-cube${spinning ? " onboard-cube--spin" : ""}${showCursor ? " onboard-cube--aim" : ""}`}
      style={style}
      aria-hidden
    >
      <div className="onboard-cube__face onboard-cube__face--front" />
      <div className="onboard-cube__face onboard-cube__face--back" />
      <div className="onboard-cube__face onboard-cube__face--right" />
      <div className="onboard-cube__face onboard-cube__face--left" />
      <div className="onboard-cube__face onboard-cube__face--top" />
      <div className="onboard-cube__face onboard-cube__face--bottom" />
      {showCursor ? <span className="onboard-cube__cursor" /> : null}
    </div>
  );
}

function HandPointer({ className }: { className?: string }) {
  return (
    <span className={`onboard-hand${className ? ` ${className}` : ""}`} aria-hidden>
      <svg viewBox="0 0 48 48" width="42" height="42" fill="none">
        <path
          d="M20 8c0-1.7 1.3-3 3-3s3 1.3 3 3v12.5l3.2-2.4c1.4-1 3.4-.7 4.4.7.7 1 .6 2.3-.2 3.2L28 32.5V38c0 1.7-1.3 3-3 3h-6.5c-1.2 0-2.3-.7-2.8-1.8L12 30.2c-.8-1.5-.3-3.4 1.1-4.4.5-.4 1.1-.6 1.7-.6H20V8Z"
          fill="currentColor"
          opacity="0.92"
        />
      </svg>
    </span>
  );
}

function TwoFingers() {
  return (
    <span className="onboard-fingers" aria-hidden>
      <span className="onboard-fingers__dot" />
      <span className="onboard-fingers__dot" />
    </span>
  );
}

type PointerSample = { x: number; y: number };

function pointerDistance(a: PointerSample, b: PointerSample): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clampScale(value: number): number {
  return Math.max(0.55, Math.min(1.85, value));
}

function OrbitDemo({ touchUi }: DemoProps) {
  const [rot, setRot] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [tried, setTried] = useState<"rotate" | "zoom" | null>(null);
  const pointers = useRef(new Map<number, PointerSample>());
  const drag = useRef<{ id: number; x: number; y: number; rotX: number; rotY: number } | null>(
    null,
  );
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  const scaleRef = useRef(scale);
  const rotRef = useRef(rot);
  const stageRef = useRef<HTMLDivElement | null>(null);
  scaleRef.current = scale;
  rotRef.current = rot;

  const ensureRot = (): { x: number; y: number } => {
    const current = rotRef.current;
    if (current) return current;
    const next = { x: -22, y: 32 };
    rotRef.current = next;
    setRot(next);
    return next;
  };

  const syncPinchFromPointers = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) {
      pinch.current = null;
      return;
    }
    const dist = pointerDistance(pts[0]!, pts[1]!);
    if (!pinch.current) {
      pinch.current = { startDist: Math.max(1, dist), startScale: scaleRef.current };
      drag.current = null;
      return;
    }
    const next = clampScale(pinch.current.startScale * (dist / pinch.current.startDist));
    if (Math.abs(next - scaleRef.current) > 0.02) setTried("zoom");
    scaleRef.current = next;
    setScale(next);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      pinch.current = {
        startDist: Math.max(1, pointerDistance(pts[0]!, pts[1]!)),
        startScale: scaleRef.current,
      };
      drag.current = null;
      ensureRot();
      return;
    }

    const base = ensureRot();
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rotX: base.x,
      rotY: base.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      syncPinchFromPointers();
      return;
    }

    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) setTried((prev) => prev ?? "rotate");
    const next = {
      x: Math.max(-60, Math.min(40, active.rotX - dy * 0.45)),
      y: active.rotY + dx * 0.45,
    };
    rotRef.current = next;
    setRot(next);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (drag.current?.id === event.pointerId) drag.current = null;

    if (pointers.current.size >= 2) {
      syncPinchFromPointers();
      return;
    }

    pinch.current = null;
    if (pointers.current.size === 1) {
      const [id, sample] = [...pointers.current.entries()][0]!;
      const base = rotRef.current ?? { x: -22, y: 32 };
      drag.current = {
        id,
        x: sample.x,
        y: sample.y,
        rotX: base.x,
        rotY: base.y,
      };
    }
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      ensureRot();
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      setScale((prev) => {
        const next = clampScale(prev * factor);
        scaleRef.current = next;
        if (Math.abs(next - prev) > 0.01) setTried("zoom");
        return next;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const interactive = rot != null || scale !== 1;

  let hint: string | null = null;
  if (tried === "zoom") {
    hint = touchUi ? "Pinch zooms — same in game" : "Scroll zooms — same in game";
  } else if (tried === "rotate") {
    hint = touchUi ? "Try pinch to zoom too" : "Try scroll to zoom too";
  }

  return (
    <div className="onboard-demo onboard-demo--orbit">
      <div
        ref={stageRef}
        className="onboard-demo__stage onboard-demo__stage--interactive"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {interactive ? (
          <VoxelCube rotX={rot?.x ?? -22} rotY={rot?.y ?? 32} scale={scale} />
        ) : (
          <VoxelCube spinning />
        )}
        {!interactive ? (
          touchUi ? (
            <div className="onboard-gesture onboard-gesture--pinch">
              <TwoFingers />
              <span className="onboard-gesture__label">Drag · pinch zoom</span>
            </div>
          ) : (
            <div className="onboard-gesture onboard-gesture--scroll">
              <span className="onboard-trackpad" />
              <span className="onboard-gesture__label">Drag · scroll zoom</span>
            </div>
          )
        ) : hint ? (
          <span className="onboard-try-hint">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

function AimDemo({ touchUi }: DemoProps) {
  return (
    <div className="onboard-demo onboard-demo--aim">
      <div className="onboard-demo__stage">
        <VoxelCube rotX={-18} rotY={28} showCursor />
        <span className="onboard-aim-trail" />
        {touchUi ? (
          <HandPointer className="onboard-hand--drag" />
        ) : (
          <span className="onboard-mouse onboard-mouse--drag" aria-hidden />
        )}
      </div>
    </div>
  );
}

function PlaceDemo({ touchUi }: DemoProps) {
  return (
    <div className="onboard-demo onboard-demo--place">
      <div className="onboard-demo__stage">
        <VoxelCube rotX={-18} rotY={28} showCursor />
        <span className="onboard-place-pulse" />
        <button type="button" className="onboard-fake-btn" tabIndex={-1} aria-hidden>
          Place
          {!touchUi ? <kbd>Space</kbd> : null}
        </button>
      </div>
    </div>
  );
}

function DepthDemo({ touchUi }: DemoProps) {
  return (
    <div className="onboard-demo onboard-demo--depth">
      <div className="onboard-demo__stage">
        <div className="onboard-layers" aria-hidden>
          <span className="onboard-layers__plane" />
          <span className="onboard-layers__plane" />
          <span className="onboard-layers__plane" />
          <span className="onboard-layers__cursor" />
        </div>
        {touchUi ? (
          <div className="onboard-gesture onboard-gesture--depth">
            <TwoFingers />
            <span className="onboard-gesture__label">2nd finger · drag</span>
          </div>
        ) : (
          <div className="onboard-gesture onboard-gesture--keys">
            <kbd>Q</kbd>
            <span className="onboard-gesture__sep">/</span>
            <kbd>E</kbd>
            <span className="onboard-gesture__label">or Shift+scroll</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CatchDemo({ touchUi }: DemoProps) {
  const [caught, setCaught] = useState(false);
  const [miss, setMiss] = useState(0);

  useEffect(() => {
    if (!caught) return;
    const t = window.setTimeout(() => setCaught(false), 1600);
    return () => window.clearTimeout(t);
  }, [caught]);

  return (
    <div className="onboard-demo onboard-demo--catch">
      <div className="onboard-demo__stage onboard-demo__stage--wide">
        <button
          type="button"
          className={`onboard-pkg onboard-pkg--a${miss === 1 ? " is-dud" : ""}`}
          aria-label="Dud package"
          onClick={() => setMiss(1)}
        />
        <button
          type="button"
          className={`onboard-pkg onboard-pkg--b${miss === 2 ? " is-dud" : ""}`}
          aria-label="Dud package"
          onClick={() => setMiss(2)}
        />
        <button
          type="button"
          className={`onboard-pkg onboard-pkg--c${caught ? " is-caught" : " is-live"}`}
          aria-label="Live package"
          onClick={() => setCaught(true)}
        />
        {caught ? <span className="onboard-catch-burst is-on" /> : null}
        {!caught ? (
          touchUi ? (
            <HandPointer className="onboard-hand--tap" />
          ) : (
            <span className="onboard-mouse onboard-mouse--click" aria-hidden />
          )
        ) : (
          <span className="onboard-try-hint">Caught — Extra unlocked</span>
        )}
      </div>
    </div>
  );
}

function UseDemo() {
  return (
    <div className="onboard-demo onboard-demo--use">
      <div className="onboard-demo__stage onboard-demo__stage--wide">
        <div className="onboard-chips" aria-hidden>
          <span className="onboard-chip onboard-chip--extra">
            Extra <strong>1</strong>
          </span>
          <span className="onboard-chip onboard-chip--clear is-active">
            Clear <strong>1</strong>
          </span>
          <span className="onboard-chip onboard-chip--tip">
            Tip <strong>1</strong>
          </span>
        </div>
        <p className="onboard-chip-hint">Clear · aim a line, then confirm</p>
      </div>
    </div>
  );
}

function WelcomeDemo() {
  return (
    <div className="onboard-demo onboard-demo--welcome">
      <div className="onboard-demo__stage">
        <VoxelCube spinning />
        <span className="onboard-brand-mark">VT</span>
      </div>
    </div>
  );
}

function ReadyDemo() {
  return (
    <div className="onboard-demo onboard-demo--ready">
      <div className="onboard-demo__stage">
        <VoxelCube spinning />
        <span className="onboard-check" aria-hidden>
          ✓
        </span>
      </div>
    </div>
  );
}

export function OnboardingIllustration({
  stepId,
  touchUi,
}: {
  stepId: OnboardingStepId;
  touchUi: boolean;
}) {
  switch (stepId) {
    case "welcome":
      return <WelcomeDemo />;
    case "orbit":
      return <OrbitDemo touchUi={touchUi} />;
    case "aim":
      return <AimDemo touchUi={touchUi} />;
    case "place":
      return <PlaceDemo touchUi={touchUi} />;
    case "depth":
      return <DepthDemo touchUi={touchUi} />;
    case "catch":
      return <CatchDemo touchUi={touchUi} />;
    case "use":
      return <UseDemo />;
    case "ready":
      return <ReadyDemo />;
  }
}
