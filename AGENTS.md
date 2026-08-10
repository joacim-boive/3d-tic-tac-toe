# AGENTS.md

## Cursor Cloud specific instructions

Voxel Toe is a single Next.js (App Router) app — a browser-based 3D tic-tac-toe game (React Three Fiber + Three.js + Zustand). There is only one service to run. Standard commands live in `README.md` and `package.json` `scripts`; prefer those over duplicating here.

Non-obvious notes for developing in this repo:

- **Dev server**: `npm run dev` (Next.js + Turbopack) serves on `http://localhost:3000`. Hotseat (local pass-and-play) and vs AI modes work with zero configuration — no backend, DB, or secrets needed.
- **Online multiplayer requires Pusher secrets** that are not committed. Without `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` in `.env.local`, the `/api/pusher-auth` route returns 503 and Online create/join fails by design. Hotseat/vs AI are unaffected, so end-to-end gameplay can be demonstrated without any secrets.
- **Checks**: `npm run typecheck` (uses `tsgo` from `@typescript/native-preview`, not `tsc`), `npm run lint` (oxlint), `npm run format` (oxfmt `--check`). `npm run check` runs all three.
- **`npm run format` currently reports pre-existing formatting issues** in `docs/plans/*`, `graphify-out/*`, and `src/scene/SelectionCursor.tsx`. These are not introduced by environment setup; do not treat them as a setup failure. Run `npm run format:write` only if intentionally reformatting.
- **Logic self-tests** run without a browser via `tsx`: `npm run check:win`, `check:pick`, `check:ai`, `check:room`, `check:notify`, `check:drop`, `check:selfplay`, `check:prefs`, `check:extra`. Useful for validating game/AI/room-code/notify logic quickly.
- **Balance eval**: `npm run eval:selfplay` runs AI-vs-AI batches and prints first/second win rate, draws, average length, and common openings. Prefer `--difficulty medium` for large N; Hard α-β is for small samples (`--budget Infinity`).
- **Always bump the product version on every PR** that ships app changes. `package.json` `version` is inlined as `NEXT_PUBLIC_APP_VERSION` and exposed at `/api/version`; Add-to-Home-Screen clients compare against it and show an upgrade banner when it (or the build id) changes. Before opening/updating a PR: `npm version patch --no-git-tag-version` (keeps `package-lock.json` in sync), commit the bump with the feature, and do not open a product PR without a version bump. Pure docs/tooling-only PRs that do not affect the deployed app may skip this.
- `graphify-out/` is generated tooling output, not app source.
