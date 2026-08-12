# Voxel Toe

Mobile-first **3D tic-tac-toe** in the browser. Spin the cube, place coral and cyan markers, and get three in a row along any axis or diagonal.

Built with Next.js, React Three Fiber, and Zustand. Designed for feel-testing playability on phone and desktop before multiplayer or heavier AI.

## Play

- **Orbit** — rotate and zoom the board
- **Place** — tap/click an empty cell to mark
- **Hotseat** — pass-and-play locally
- **vs AI** — Easy / Medium / Hard opponent in the browser
- **Online** — create a room, share the code or `/play/CODE` link; both enter names; match auto-starts
- **Placement** — **Free** (any empty cell) or **Drop** (gravity: pick a column, markers fall and stack from the bottom with a light bounce)
- **Shareable setup** — mode, placement, preset, power-ups, and AI difficulty stay in the URL (`?mode=ai&placement=drop&preset=4x4x4&difficulty=hard&powerUps=on`) so you can copy the link and send the same setup to someone else

### Online setup

1. Create a free [Pusher Channels](https://pusher.com/channels) app.
2. Enable **client events** on the app (App Settings).
3. Add env vars in `.env.local` (and Vercel):

```bash
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=eu
NEXT_PUBLIC_PUSHER_KEY=...   # same as PUSHER_KEY
NEXT_PUBLIC_PUSHER_CLUSTER=eu
```

4. `npm run dev` — two browsers, Mode → Online, Create / Join (or open the shared `/play/CODE` link).

Without these vars, auth returns 503 and Online create/join fails.

### Presets

| Preset | Board | Win length |
| ------ | ----- | ---------- |
| 3×3    | 3×3×1 | 3          |
| 3×3×3  | 3³    | 3          |
| 4×4×4  | 4³    | 4          |
| 5×5×4  | 5×5×4 | 4          |

Win length defaults to the board’s Z depth; flat boards set it explicitly (classic 3×3 is one cell deep with 3 in a row). Lines count along axes, face diagonals, and space diagonals. Mid/large presets need four in a row so Drop and Free games stay competitive past the opening.

## Stack

- [Next.js](https://nextjs.org/) (App Router) + React 19
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [drei](https://github.com/pmndrs/drei) + Three.js
- [Zustand](https://zustand-demo.pmnd.rs/) for game state
- [@react-three/rapier](https://github.com/pmndrs/react-three-rapier) for Drop-mode gravity / bounce (and future tilt power-ups)
- TypeScript, oxlint, oxfmt

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build      # production build
npm run check      # typecheck + lint + format
npm run check:win  # win-detection self-check
npm run check:drop # gravity drop-landing self-check
npm run check:extra # Extra window Place→spend+place self-check
npm run check:selfplay  # self-play harness smoke test
npm run eval:selfplay -- --all --games 2000 --difficulty medium
```

Self-play eval prints first/second win rate, draw rate, average game length, and common openings — useful when tuning presets or trying new mechanics.

## Deploy

Live at **[3d-tic-tac-toe-one.vercel.app](https://3d-tic-tac-toe-one.vercel.app)**.

Pushes to `main` deploy to production once the GitHub repo is linked in the [Vercel project](https://vercel.com/joacim-boives-projects/3d-tic-tac-toe).

## License

No license yet — all rights reserved unless stated otherwise.
