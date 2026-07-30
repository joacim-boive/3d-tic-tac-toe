# AI Difficulty Design

Date: 2026-07-30

## Goal

Replace the random vs-AI opponent with Easy / Medium / Hard levels that run entirely in the browser. Difficulty is chosen on the setup screen and locked for the match.

## Decisions

- **Levels:** `easy` | `medium` | `hard` (default: `medium`).
- **UI:** Chip row under Mode, visible only when Mode is vs AI. Same chip style as Hotseat / vs AI. No mid-game change, no `localStorage`.
- **HUD:** Keep “vs AI”; no difficulty subtitle (YAGNI).
- **Runtime:** Browser only. No workers, no server, no new deps. Keep ~400ms AI delay.
- **Hard strategy is adaptive by board size:**
  - **3×3×3:** α-β minimax to endgame (near-perfect).
  - **4×4×3 / 5×5×3:** win/block + shallow depth-2/3 search with a simple line-score heuristic.

## Behavior ladder

Shared tactics (Medium / Hard always; Easy sometimes):

1. If AI can win now → take it.
2. Else if human can win next → block it.

| Level    | Extra behavior                                                                 |
| -------- | ------------------------------------------------------------------------------ |
| Easy     | ~70% random empty cell; ~30% win/block only. Beatable, not suicidal.           |
| Medium   | Always win/block; prefer a threat (2-in-a-row with an open cell); else random. Same on all sizes. |
| Hard     | Adaptive search as above.                                                      |

## Wiring

- `types.ts` — add `AiDifficulty`.
- `src/game/ai.ts` (new) — `pickAiMove(board, dims, difficulty, aiPlayer)` plus win/block, heuristic, α-β.
- `store.ts` — `aiDifficulty` + `setAiDifficulty`; `scheduleAiMove` calls `pickAiMove` instead of `randomEmptyCell`. Ignored in hotseat.
- `board.ts` — reuse win/empty helpers; add `listEmptyCells` only if needed. No AI logic here.
- `SetupScreen.tsx` — difficulty chips when `playMode === "ai"`.

## Check

One runnable self-check (assert-style, no test framework): open winning move is taken; forced block happens.

## Out of scope

Mid-game difficulty change, persistence, Web Worker offload, perfect play on 4×4×3 / 5×5×3, multiplayer AI.
