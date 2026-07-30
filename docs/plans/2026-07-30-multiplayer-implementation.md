# Online Multiplayer — Implementation Plan

Date: 2026-07-30  
Design: `docs/plans/2026-07-30-multiplayer-design.md`  
Provider: **Pusher** (presence channels + client events; auth via Next route)

## Env (blocker)

1. Free Pusher Channels app → enable **client events**.
2. `.env.local`:

```bash
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=eu
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=eu
```

3. Same on Vercel for preview/production.

Without these, auth 503s and Online mode shows a clear error.

## Tasks

### 1. Types + room code helper

- [ ] `PlayMode` += `"online"`
- [ ] `OnlineStatus`, `PlayerNames`, rematch vote types
- [ ] `src/game/roomCode.ts` — generate / normalize 4-char codes (alphabet without `0O1I`); `normalizeRoomCode(input)`
- [ ] Self-check: charset + normalize round-trip

### 2. Store online fields

- [ ] Add: `playerNames`, `localName`, `roomId`, `seat`, `onlineStatus`, `rematchVotes`, `opponentConnected`
- [ ] `displayName(player)` → name or Coral/Cyan fallback
- [ ] Gate `place` / `placeAtCursor`: online → only own `seat` + `onlineStatus === "playing"` + game `status === "playing"`
- [ ] `applyRemotePlace(coord, by)` — same `applyPlace`, no publish
- [ ] `beginOnlineLobby` / `startOnlineGame` / `pauseOnline` / `resumeOnline` / `resetForRematch` / `leaveOnline`
- [ ] Hotseat rematch (`startGame`) unchanged; online win/draw does **not** use chrome Rematch→`startGame` (dialog instead)

### 3. Pusher auth route + thin client

- [x] `npm i pusher pusher-js`
- [x] `src/app/api/pusher-auth/route.ts` — authorize `presence-room-*` with seat/name/preset
- [x] `src/online/pusherClient.ts` — connect with custom auth handler
- [x] `src/online/session.ts` — create/join; client events `client-place` | `client-ready` | `client-rematch` | `client-state`
- [x] Room full / not found / disconnect grace as designed

### 4. Setup + lobby UI

- [ ] Setup: Online chip; name input; when online hide AI difficulty; preset only meaningful for host create
- [ ] Buttons: **Create room** / **Join room** (code field); hide plain Start when online
- [ ] Lobby view: code, copy link (`origin/play/{code}`), waiting copy
- [ ] Wire session → store transitions

### 5. Join-via-link route

- [ ] `src/app/play/[code]/page.tsx` — name form → join that code (reuse session helpers)
- [ ] Invalid code format → friendly error before Ably

### 6. In-game sync + chrome

- [ ] On successful local `place` in online mode → publish `place`
- [ ] On remote `place` → `applyRemotePlace`
- [ ] `GameChrome`: names via `displayName`; mode label “Online”; paused status text; suppress local Rematch button when online (show dialog)
- [ ] Block place controls while paused or not your turn

### 7. Rematch dialog

- [ ] Modal on won/draw in online: Yes / No; show opponent vote
- [ ] Both accept → `resetForRematch` + publish/listen sync empty board
- [ ] Either decline → `leaveOnline` → setup for both (publish decline)

### 8. Polish + verify

- [ ] README: Online mode, Ably env, how to play two browsers
- [ ] Manual check list from design doc
- [ ] `npm run check` + existing self-tests still pass

## File map (expected)

| Path                              | Role                             |
| --------------------------------- | -------------------------------- |
| `src/game/types.ts`               | online types                     |
| `src/game/roomCode.ts`            | codes                            |
| `src/game/store.ts`               | online state + gates             |
| `src/online/ablyClient.ts`        | Ably connect                     |
| `src/online/session.ts`           | room lifecycle                   |
| `src/online/messages.ts`          | payload types                    |
| `src/app/api/ably-token/route.ts` | token                            |
| `src/app/play/[code]/page.tsx`    | deep link                        |
| `src/ui/SetupScreen.tsx`          | create/join                      |
| `src/ui/LobbyScreen.tsx`          | waiting / copy                   |
| `src/ui/RematchDialog.tsx`        | rematch                          |
| `src/ui/GameChrome.tsx`           | names / pause                    |
| `src/app/page.tsx`                | phase: setup \| lobby \| playing |

## Order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Do not skip env before manual two-browser test.
