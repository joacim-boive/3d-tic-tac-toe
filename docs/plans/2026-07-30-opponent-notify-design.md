# Opponent Connected Notifications Design

Date: 2026-07-30

## Goal

Notify the waiting player when their opponent connects: lobby join and mid-game reconnect. v1 uses the browser Notification API while the tab is still open; true Web Push (closed tab) is deferred.

## Decisions

- **Triggers:** Opponent joins lobby; opponent returns after disconnect pause.
- **Delivery:** In-tab `Notification` API only (no service worker / VAPID).
- **Permission:** Request once when host enters the lobby. Mid-game uses existing grant only — no second prompt.
- **Focus:** Skip notification if the document is visible and focused.
- **Denied / unsupported:** Silent no-op; no nag UI.
- **Out of scope (v1):** Web Push, settings toggle, iOS PWA install flow.

## Flow

1. Host creates room → lobby mounts → `requestNotifyPermission()` if permission is `default`.
2. Guest joins → host (if blurred / unfocused and granted) gets “Opponent joined”.
3. Mid-game disconnect → pause; opponent rejoins → waiting player (if granted + unfocused) gets “Opponent back”.

## Pieces

- `src/online/notify.ts` — `requestNotifyPermission()`, `notifyOpponentConnected(kind, name?)`.
- `LobbyScreen` — host-only permission request on mount.
- `session.ts` — call notify on `pusher:member_added` for lobby join and paused → resume.

## Copy

| Kind         | Title             | Body                                  |
| ------------ | ----------------- | ------------------------------------- |
| joined       | Opponent joined   | `{name} is ready — match starting`    |
| reconnected  | Opponent back     | `{name} reconnected`                  |

Notification click focuses the window and closes the notification.

## Later (not v1)

True Web Push: service worker, VAPID keys, subscription storage, server trigger on presence.

## Check

- Host create → allow permission → blur tab → guest join → notification.
- Same with deny → silence.
- Focused tab → no notification.
- Mid-game leave → blur → rejoin → reconnect notification.
- Hotseat / AI unchanged.
