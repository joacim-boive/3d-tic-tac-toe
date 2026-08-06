# Self-Play Balance Eval

Date: 2026-07-31

## Goal

When changing rules (win length, Drop gravity, blocked cells, rotating layers, etc.), measure whether the game is actually fairer — not just different — by letting the existing in-browser AI play itself for thousands of games and collecting hard stats.

## Metrics

- First-player win rate (Coral opens)
- Second-player win rate
- Draw rate
- Average game length (plies)
- Most common openings (first N plies)

## Agents

Both seats use the same policy by default (symmetric self-play):

| Difficulty | Role in eval |
| ---------- | ------------ |
| Easy       | Noisy baseline |
| Medium     | Default for large batches (win/block/threat + quiet eval). Fast enough for 10k–100k games. |
| Hard       | α-β / iterative deepening. Use small N + `--budget Infinity` for offline quality checks. |
| Extreme    | Deeper α-β + two-ply force tactics. Compare with `--vs hard --swap`. |

### Measuring Extreme strength

Symmetric self-play only shows first-player bias — not whether Extreme is stronger than Hard.
Use a head-to-head matchup with seat swaps:

```bash
npm run eval:selfplay -- --preset 4x4x4 --placement free \
  --difficulty extreme --vs hard --swap --games 40 --progress
```

Omitting `--budget` on a `--vs` matchup uses each level’s browser think-time (Hard ~80ms, Extreme ~900ms). The report includes:

- **Primary / Opponent wins** — raw head-to-head
- **Primary as first / as second** — split by seat (4×4×4 free has a large opener bias)
- **Seat-averaged strength** — mean of the two seat win rates; **50% ≈ even** after cancelling who opened

Re-run with the same `--seed` when comparing AI changes. Tactical regressions also live in `npm run check:ai` (forks + force-then-fork occupy/block).

## Commands

```bash
npm run check:selfplay   # smoke
npm run eval:selfplay -- --help
npm run eval:selfplay -- --all --games 2000 --difficulty medium
npm run eval:selfplay -- --preset 4x4x4 --placement drop --games 100000 --difficulty medium
npm run eval:selfplay -- --preset 3x3x3 --difficulty hard --games 200 --budget Infinity
```

## Reading results

- First-player ≫ 50% and short average length ⇒ opener steamroll (old 4×4×3 / 3-in-a-row Drop).
- Rates near 50/50 with non-trivial length ⇒ healthier for hotseat.
- Draw-heavy with long games ⇒ win condition may be too hard / board too sparse.

## Sample baseline (medium × 2000 games, seed default)

| Preset | Mode | First | Second | Draw | Avg plies |
| ------ | ---- | ----- | ------ | ---- | --------- |
| 3×3×3  | free | 60.4% | 39.6%  | 0%   | 9.0       |
| 3×3×3  | drop | 57.9% | 42.1%  | 0%   | 9.7       |
| 4×4×4  | free | 45.8% | 40.3%  | 13.9%| 40.8      |
| 4×4×4  | drop | 49.3% | 46.0%  | 4.7% | 40.6      |
| 5×5×4  | free | 54.0% | 46.0%  | 0%   | 28.5      |
| 5×5×4  | drop | 56.1% | 43.9%  | 0%   | 35.1      |

Throughput (rough): 3×3×3 drop ~1500 games/s; 4×4×4 drop ~80/s; 5×5×4 free is the slow path — prefer Drop or smaller N when iterating mechanics.

## Out of scope

Web Worker offload, Elo ladders, opening books, learning, UI dashboard.
