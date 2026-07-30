# Online Multiplayer Design

Date: 2026-07-30

## Goal

Add a simple two-player online mode: short shareable room codes (and links), player names on turn/status copy, move sync over managed realtime (Ably or Pusher — not PartyKit for v1).

## Decisions

- **Join:** Code **and** copyable link (`/play/K7XM`).
- **Settings:** Host only (preset). Joiner enters name only.
- **Start:** Auto-start when the second named player joins.
- **Seats:** Host = `a` (Coral), joiner = `b` (Cyan). Colors stay; names are labels.
- **Disconnect:** Pause (“waiting for …”); resume on rejoin same room (~60s window), else lobby.
- **Rematch:** Dialog; both must accept → new board, same room/seats. Either declines → lobby.
- **Transport:** Managed pub/sub (Ably or Pusher). Client-trusted authority for v1 (friends sharing a link).
- **Out of scope:** Chat, spectators, ranked, anti-cheat, seat swap, PartyKit, create-on-miss join.

## Flow

1. Setup → Online → name + (host) preset → **Create** or **Join**.
2. Create → lobby with code + Copy link; wait.
3. Join via code or `/play/[code]` + name → same channel.
4. Both present → `playing` with host preset.
5. Places published; peers apply existing `applyPlace` / win check. Aiming stays local.
6. Win/draw → rematch votes → rematch or lobby.

## UI

- Setup: Online chip; name field (required, ~16 chars); Create / Join.
- Lobby: waiting / “X joined — starting…”.
- Chrome: `Alex to place`, `Sam wins`, `Waiting for Alex to reconnect…`.
- Rematch: Yes/No; show opponent vote when known.

## State (Zustand)

- `playMode: "online"` beside hotseat/ai.
- `playerNames: { a, b }`, `roomId`, `seat`, `onlineStatus: "lobby" | "playing" | "paused" | "ended"`, rematch votes.
- Gate `place()`: own seat + `playing` only (same idea as AI gating).

## Wire

Channel: `room:{code}` (4–6 chars, no ambiguous `0/O/1/I`).

| Event | Payload | Who |
| ----- | ------- | --- |
| `hello` | `{ seat, name, preset }` | Host create / guest join |
| `ready` | `{ names, preset, seats }` | When both present → start |
| `place` | `{ x, y, z, by }` | Current player |
| `rematch` | `{ seat, accept }` | After game over |
| `state` | `{ board, currentPlayer, names, preset }` | Reconnect catch-up |
| Presence | join/leave | Provider API |

Ignore bad/duplicate/wrong-seat/occupied places. Full room → “Room full”. Unknown code → “Room not found”.

**Auth:** Next API route issues short-lived subscribe/publish token; keys stay server-side.

## Wiring (implement later)

- `types.ts` — online mode + name/status types.
- `store.ts` — online fields; gate `place`; apply remote places.
- Thin realtime client module + token API route.
- `SetupScreen.tsx` / lobby / rematch dialog / `GameChrome` name copy.
- `app/play/[code]/page.tsx` — join-via-link.

## Check

- Two browsers: create → share link → join with names → auto-start → alternate places → names on HUD.
- Disconnect mid-game → pause → reconnect → resume from snapshot.
- Rematch both yes → new game; one no → lobby.
- Hotseat / AI unchanged.
