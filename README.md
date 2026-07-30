# Voxel Toe

Mobile-first **3D tic-tac-toe** in the browser. Spin the cube, place coral and cyan markers, and get three in a row along any axis or diagonal.

Built with Next.js, React Three Fiber, and Zustand. Designed for feel-testing playability on phone and desktop before multiplayer or heavier AI.

## Play

- **Orbit** — rotate and zoom the board
- **Place** — tap/click an empty cell to mark
- **Hotseat** — pass-and-play locally
- **vs AI** — play against a simple random-move opponent

### Presets

| Preset | Board | Win length |
| ------ | ----- | ---------- |
| 3×3×3  | 3³    | 3          |
| 4×4×3  | 4×4×3 | 3          |
| 5×5×3  | 5×5×3 | 3          |

Win length follows the board’s Z depth. Lines count along axes, face diagonals, and space diagonals.

## Stack

- [Next.js](https://nextjs.org/) (App Router) + React 19
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [drei](https://github.com/pmndrs/drei) + Three.js
- [Zustand](https://zustand-demo.pmnd.rs/) for game state
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
```

## Deploy

Live at **[3d-tic-tac-toe-one.vercel.app](https://3d-tic-tac-toe-one.vercel.app)**.

Pushes to `main` deploy to production once the GitHub repo is linked in the [Vercel project](https://vercel.com/joacim-boives-projects/3d-tic-tac-toe).

## License

No license yet — all rights reserved unless stated otherwise.
