# Voxel Toe — 3D Tic-Tac-Toe MVP Design

Date: 2026-07-30

## Goal

Mobile-first webapp: configurable preset 3D tic-tac-toe board, orbit/zoom, translucent markers, local hotseat or vs simple AI. Hosted on Vercel. Feel-test playability at stable ~60fps before multiplayer, leaderboards, or power-ups.

## Decisions

- **Platform:** Web (Next.js), not native — shareable links and Vercel multiplayer later.
- **Stack:** Next.js App Router, React Three Fiber, drei, Zustand, TypeScript.
- **Modes:** Hotseat and vs AI (random valid move, ~400ms delay).
- **Markers:** Coral / cyan translucent spheres (not X/O).
- **Board size:** Presets only (stable IDs for future AI top lists). Architecture supports up to 20³.
- **Controls:** Orbit vs Place toggle — orbit for rotate/zoom, place for tap-to-mark.
- **Rendering:** Sparse board map; single `LineSegments` grid; two `InstancedMesh` marker pools. No shadows/postprocessing. `dpr` capped at 1.5.

## Presets

| ID          | Size | Win length |
| ----------- | ---- | ---------- |
| `classic-4` | 10³  | 4          |
| `deep-5`    | 12³  | 5          |
| `epic-10`   | 16³  | 10         |

## Win detection

From the last placed cell, scan 13 positive 3D directions (axes, face diagonals, space diagonals), counting contiguous same-player cells forward and backward. O(winLength) per direction.

## Interaction

1. Setup screen: pick preset + Hotseat / vs AI → Start.
2. In-game HUD: Orbit | Place, turn/status, Menu, Rematch on end.
3. Place mode locks OrbitControls; ray-march snaps to nearest empty cell; ghost preview; tap commits.

## Out of scope (later)

Multiplayer, leaderboards, power-ups, accounts, strong AI, PWA, native.

## Performance notes

Empty cells are not meshes. At 16–20³ only lattice lines + occupied instances hit the GPU. Prefer rejection sampling for AI empty-cell picks until density is high.
