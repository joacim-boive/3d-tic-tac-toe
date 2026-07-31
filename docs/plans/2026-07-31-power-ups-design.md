# Power-Ups Design

Date: 2026-07-31

## Goal

Add optional power-ups that bend the grid without breaking the core loop: place markers, get `dims.z` in a row, feel good in 3D. Acquisition is a **luck + skill package-catch mini-game** (not free starting stock). Spendable kinds:

1. **Extra turn** — place two markers in one turn
2. **Clear one row** — wipe every marker along a chosen axis-aligned line
3. **Tip the field** — reorient the cube so markers fall into new cells (physics)

This doc is a brainstorm + proposed shape. Decisions below marked **Proposal** are defaults to argue against; open questions are listed per power-up and in Shared.

## Constraints from the current game

| Fact | Implication |
| ---- | ----------- |
| Sparse `Map<"x,y,z", PlayerId>` board | Logic power-ups are cheap; visuals/physics are the cost |
| Free vs Drop placement | Clear/Tip must define post-effects for both (especially Drop stacking) |
| Win length = `dims.z` | Tip on non-cube presets (`5×5×4`) remaps axes → win-length semantics change |
| Turns flip in `applyPlace` | Extra turn is a one-line state change if we add a “bonus places left” counter |
| Online sync is place + full `state` snapshot | Prefer authoritative outcomes + `state` (or typed power-up messages) over dual physics sims |
| Rapier exists only in Drop; falls are scripted, settled bodies fixed | Tip needs real dynamic bodies + gravity/collider reorientation — README already flags this |
| AI / self-play are pure logic | Each power-up needs a deterministic logic twin (even Tip) for AI + balance eval |

## Shared framing (all three)

### Economy — package catch mini-game

Getting a power-up is its own little skill-and-luck beat — not a free starting inventory.

**Fantasy:** three identical packages streak across the playfield in random directions. Fast enough that grabbing all three is unrealistic. **Only one package is live**; the other two are duds. Catch the live one → you bank a random power-up. Miss everything (or only hit duds) → nothing.

```text
place / turn resolves
        │
        ▼
  package flyby (optional window)
        │
   catch live? ──yes──► roll PowerUpId → inventory[player][id]++
        │
        no
        ▼
  continue (opponent’s turn / next place)
```

#### When does the flyby happen?

**Proposal:** after every successful place that leaves the match still `playing` (and after Drop settle if needed). That ties reward to tempo: more places ⇒ more chances, without pausing before the first move.

Alternatives:

- Only every Nth place / every other turn (less noisy, less snowball)
- At the **start** of your turn (catch then decide whether to spend)
- Only when the board crosses density thresholds

Open: should a flyby also fire after Clear/Tip (no place)? **Proposal: no** — only after a place, so the mini-game stays tied to the core verb.

#### Who may catch?

**Proposal:** only the player who just placed (the “earner”). Opponent watches. Avoids hotseat fights over the same crate and keeps online authority simple.

- **Hotseat:** earner’s device/session clicks packages.
- **Online:** only that seat’s client accepts clicks; peers see the same flyby.
- **vs AI:** human plays the skill catch when they earn; when the AI earns, it **does not** aim — it rolls luck (below).

#### Package swarm (feel)

| Knob | Proposal (v1) |
| ---- | ------------- |
| Count | Always **3** packages |
| Live count | Exactly **1** live; 2 duds |
| Paths | Random spawn on a screen/scene edge → exit opposite-ish edge; varied speeds/arcs |
| Duration | ~1.2–2.0s on screen; hard to multi-tap all three on mobile |
| Look | Identical while flying (no tell). Reveal burst only on tap: sparkle = live, poof = dud |
| Input | Tap/click hit-test on package sprites (2D overlay in screen space is easiest; 3D scene props optional later) |
| Miss | Window ends → no reward; game continues |
| Multi-hit | You may tap more than one; first **live** hit awards and ends the swarm early; dud hits just waste time |

**2D overlay vs 3D props:** proposal = **HTML/canvas overlay** above the R3F canvas for v1 (reliable hit targets, no orbit conflict). Packages can still *read* as flying through the volume via parallax/depth cue.

Seed trajectories + `liveIndex` from a match RNG so online peers share one movie.

#### What’s inside the live package?

**Proposal:** on a successful live catch, roll uniformly among enabled power-up kinds (`extra-turn` | `clear-row` | `tip`). Identity is hidden until catch (or shown in the reveal burst).

Alternatives: weighted toward Extra early / Tip late; or packages are typed (different silhouettes) — more readable, less mystery.

#### Stacking / caps

**Proposal:** inventories are **counts**, not booleans — you can hold multiples of the same kind.

Soft cap per kind (e.g. max 2) so a lucky streak doesn’t hoard the match. Open: hard cap vs none for v1.

Rematch: inventories reset to empty; flybys resume from scratch.

#### AI catch (luck, not skill)

When the AI is the earner:

**Proposal:** skip the visual skill check (or play a short autopilot flyby for the human to watch). Roll once:

- `catchChance` ≈ 1/3 (same spirit as “one of three is live,” without requiring frame-perfect AI)
- On success → same uniform power-up roll → AI inventory++
- On miss → nothing

Optionally animate the AI “grabbing” a random package so the human sees the outcome. AI **uses** banked power-ups with simple heuristics later (Phase 4); until then it may catch-and-hold or catch-and-spend randomly.

Self-play / eval: model earn as Bernoulli(`catchChance`) + uniform kind — no graphics.

#### Online sync

```ts
// host/earner broadcasts the flyby plan, then the result
{ type: "package-swarm", seed: number, liveIndex: 0|1|2, earner: PlayerId }
{ type: "package-result", earner: PlayerId, caught: boolean, kind?: PowerUpId }
```

Peers animate from `seed`/`liveIndex`. Only `earner` may emit `package-result` (or host validates). Inventory always included on full `state` snapshots for reconnect.

### Inventory HUD — who has what

Must always be obvious **for both players**:

- Two inventory rows (or columns): Coral / Cyan, each with icon + count for Extra / Clear / Tip.
- Counts update instantly on catch and on spend.
- On your turn, **your** chips with count > 0 are actionable buttons; opponent’s row is read-only.
- Empty kinds show `0` or a dim slot (don’t hide — makes asymmetry readable).
- Optional toast: “Coral caught Extra turn!” / “Cyan missed the packages.”

Hotseat: same dual display so the waiting player sees what they’re up against. Online: same. Setup toggle: **Power-ups: Off / On** (disables flybys + hides inventory).

### When can you use one?

**Proposal:** on your turn, **before** placing (or instead of placing for Clear / Tip), if you have count > 0. Using a power-up that does not place still **consumes the turn**, except Extra turn which *is* the place action with a bonus.

| Power-up | Consumes turn? | Then place? |
| -------- | -------------- | ----------- |
| Extra turn | Yes (your normal turn, extended) | You place twice |
| Clear row | Yes | No (unless we later allow “clear then place”) |
| Tip field | Yes | No (settle → opponent’s turn) |

Rationale: Clear and Tip are already strong board mutations; stacking them with a free place in the same turn is likely oppressive. Easy to loosen later once we have numbers.

Spending does **not** trigger a new package flyby (only places do).

### UI shell

- Dual inventory in `GameChrome` (both players, counts).
- Activating enters a **power-up mode** (like Orbit vs Place): cancel returns to normal place; refund if cancelled before commit where applicable.
- Package swarm overlay component (own input layer; pause place commits during the window).
- Online: only the earner clicks packages; only current seat activates spends; peers get swarm + result + inventory via messages/`state`.

### Free vs Drop

Power-ups should work in **both** placement modes unless noted. Drop always needs a **repack** step after Clear/Tip: for each column along current “up”, markers fall to the lowest empty cells, preserving relative order (or full physics settle — see Tip). Package flybys are mode-agnostic (overlay).

---

## 1. Extra turn

### Fantasy

“I get to place two balls.” Same marker, same rules, twice before the opponent acts.

### Mechanics (proposal)

1. Player activates **Extra turn** on their turn (inventory −1).
2. Store sets `bonusPlacesRemaining = 1` (meaning: after the next successful place, skip the turn flip once).
3. First legal place → win/draw check as normal. If still playing, **do not** flip `currentPlayer`; clear or decrement bonus.
4. Second legal place → normal win/draw / flip.
5. If the first place wins or draws, the bonus is wasted (match over).

Equivalent mental model: `placesThisTurn = 2` countdown.

### Edge cases

| Case | Proposal |
| ---- | -------- |
| Drop: first piece still falling | Block second place until `finishDrop` (existing `dropBusy`) |
| Online | Two `place` messages while `currentPlayer` stays the same; or one `powerup: extra-turn` then two places. Peers must not flip early |
| AI scheduling | Only schedule AI after bonus is exhausted |
| Cancel after activating, before placing | Refund inventory **or** lock in on activate — prefer **lock on first place**, allow cancel before first place with refund |
| Same cell twice | Illegal (cell occupied) |

### Feel / UX

- Subtle HUD: “Extra place — drop again”.
- Optional second ghost / pulse so the double turn is obvious to both players (esp. online / hotseat).
- No board mutation beyond two places — easiest juice: short celebratory ping between places.

### Balance notes

- Strongest on small boards (`3×3×3`) where two connected places often create an unstoppable threat.
- In Drop, two places in different columns ≈ two normal turns of tempo; two in one column is a tall stack — still tempo, less fork potential.
- Self-play: model as “occasionally take two plies” and measure first-player win rate shift.

### Why ship first (among spends)

Smallest spend surface: mostly `applyPlace` + inventory decrement + UI. Ships right after the catch loop (Phase 0) so earn → show counts → spend is playable end-to-end before Clear/Tip.

---

## 2. Clear one row

### Fantasy

Pick a straight line through the volume and delete every marker on it. Rotate the view (or the mental “up”) so “row” means horizontal or vertical — same mechanic, different axis.

### What is a “row”?

The codebase has **win lines** (13 directions) but no first-class “row”. For this power-up we should **not** clear arbitrary diagonals in v1 — too hard to aim and too swingy.

**Proposal — axis-aligned full line:**

A row is all cells with two coordinates fixed and one varying across the full extent, e.g.:

- Along X: fixed `(y, z)`, all `x ∈ [0, dims.x)`
- Along Y: fixed `(x, z)`, all `y ∈ [0, dims.y)`
- Along Z: fixed `(x, y)`, all `z ∈ [0, dims.z)`

So on `4×4×4` a row always has 4 cells; on `5×5×4` an X-row has 5, a Z-row has 4.

**Not in v1:** clearing a whole plane/layer (25 cells on 5×5) — that is a different, much stronger power-up (“Clear layer”).

### Selection UX (proposal)

1. Activate Clear → enter slice-pick mode.
2. Player chooses **axis** (X / Y / Z) via a small control **or** by rotating the board metaphor:
   - **Camera-assist (recommended):** orbit so the desired axis reads as “left–right”; the picker treats the screen-horizontal lattice lines as candidates. Matches “by rotating the playing field” without literally rotating cell coordinates.
   - **Explicit axis toggle:** three buttons — clearer for AI/online debugging, less magical.
3. Hover/aim highlights the candidate line (translucent tube or cell outlines). Occupied cells pulse; empty cells still count as part of the line (clearing empties is a no-op for those cells).
4. Confirm → delete all markers on that line → inventory −1 → **Drop repack** if needed → win/draw? → end turn.

**Win after clear?** Normally clearing cannot *create* a new N-in-a-row for the clearer (you only remove). It can:

- Break the opponent’s threats
- Rarely… never create your own line by deletion alone

So post-clear win check is only needed if we later combine with Tip/repack that moves pieces. For Clear alone: **recompute draw** (board emptier), status stays playing unless somehow occupiedCount logic cares — no new winner from delete-only.

After **Drop repack**, pieces move → **must** run win checks (possibly for either player!). **Proposal:** if repack completes a line for anyone, that player wins (including “suicide” if your own stack completes — rare). Prefer checking both players; if both would win (pathological), clearer’s opponent wins / or treat as draw — flag as open question.

### Free vs Drop

| Mode | After clear |
| ---- | ----------- |
| Free | Markers stay in remaining cells; holes are fine |
| Drop | For every column (fixed x,z), compact markers toward y=0 preserving order |

Repack should be a pure function `repackDrop(board, dims) → Board` for AI/tests, with optional fall animation reusing Drop juice.

### Online

Message shape (proposal):

```ts
{ type: "powerup", kind: "clear-row", axis: "x" | "y" | "z", a: number, b: number, by: PlayerId }
```

Peers apply the same delete + repack, or host sends a follow-up `state` snapshot (safest for version skew).

### Balance notes

- Clearing your own markers is allowed (player skill / desperation).
- Empty-line clears are wasteful but legal — or ban confirming a fully empty line (proposal: **allow**, keep rules simple).
- Stronger on dense late boards; weak early — healthy.
- Interaction with Extra turn: if both are once-per-match, Extra is tempo, Clear is reset — fine.

### Open questions

- Axis via camera vs explicit toggle?
- Allow diagonal “rows” later?
- Does Clear end the turn, or Clear + place?
- Plane clear as a separate legendary power-up?

---

## 3. Tip the playing field

### Fantasy

Turn the cube over. Markers tumble with real gravity into a new resting configuration. The smartest / juiciest / hardest of the three.

### What “tip” means

**Proposal — 90° cardinal tips only** (6 faces can become “down”): rotate the gravity direction (or the board frame) by ±90° around X or Z (no 45°, no free tumble). Player picks one of four side-tips relative to current up, or a full 180° flip if we allow it.

Mental model:

1. Choose new **down** axis/sign among the six signed axes, excluding current down (or allow 180).
2. Play a board/camera tip animation.
3. Markers become dynamic rigid bodies; gravity points to new down; walls/floor match the box.
4. Wait until all asleep / velocity below epsilon / timeout.
5. **Quantize** each marker to nearest in-bounds cell center; resolve overlaps deterministically.
6. Commit new `Board` map; remap `dims` / axis labels if the box is no longer aligned with “Y = up” in logic space.
7. Win/draw check → end turn.

### Logic twin (required)

Physics is for feel; **authoritative outcome** must be reproducible without Rapier for AI, self-play, online host resolve, and tests:

```text
tipBoard(board, dims, fromDown, toDown) → { board, dims, down }
```

Algorithm sketch:

1. Map each occupied cell into a continuous position in the box.
2. Apply the same rotation that takes `fromDown → toDown`.
3. Sort markers along the new down axis (stable by player id / old key for ties).
4. Pack into integer cells along each column perpendicular to new down (Connect-4 style toward the new floor).
5. Optionally rotate the dim labels so logic “Y” is always up again (`dims` permutation + winLength stays the physical depth we choose — see non-cube).

This matches Drop’s stacking intuition and avoids chaotic multi-body tunneling defining online winners.

**Proposal:** simulate with Rapier for the animation, but **commit the logic-pack result** (lerp/snap visuals to quantized cells at the end). If physics and logic diverge slightly, trust logic.

### Non-cube boards (`5×5×4`)

Tipping can swap a length-5 axis with length-4. Options:

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **A. Tip only on cube presets** | Simple | Power-up missing on a main preset |
| **B. Tip remaps dims + win length = current “depth” or keep win length = 4** | Works everywhere | Players must understand win length may follow an axis |
| **C. Tip only 180° / around axes that preserve shape** | Shape stable | Weaker fantasy (“turn over any way”) |

**Proposal:** v1 = **A** (cubes only: `3×3×3`, `4×4×4`), with UI disabled + explanation on `5×5×4`. Revisit B once cube Tip feels good. Win length today is `dims.z`; any remapping scheme must update that helper explicitly.

### Free vs Drop

Tip makes Free boards “go Drop for a moment.” After Tip:

**Proposal:** restore the match’s placement mode rules for future places (Free stays Free — floating holes allowed again after quantization pack… wait).

Inconsistency: logic pack always stacks to the new floor, so a Free board becomes “grounded” after Tip. That is actually a cool consequence (“earthquake settles everything”) and matches physics fantasy. Document it: **Tip always settles markers against the new floor**, even in Free mode.

### Scene work

- Enable Physics for the Tip effect in Free mode (temporary `Physics` world) or keep a persistent world with disabled gravity until Tip.
- Settled markers today are `fixed` RigidBodies — Tip must set them `dynamic`, then freeze again after settle.
- Replace scripted Drop parabola for this effect (or only use dynamics during Tip).
- Camera: orbit can stay user-controlled; optionally ease the default camera with the tip so “down” still feels down.
- Board mesh: rotate the lattice with the tip **or** keep lattice fixed and only change gravity — **proposal: rotate the playable box visually** so the floor is always the bottom of the screen’s mental model; logic then rebases coords so Y is up again (invisible to the player).

### Online

**Do not** run independent physics on both clients for the outcome.

1. Actor sends `{ type: "powerup", kind: "tip", toDown: ... }`.
2. Both clients play the same animation seeded by `toDown` + board hash (optional).
3. Both apply identical `tipBoard` logic (or host applies and broadcasts `state`).

Desync risk is high if animation-driven; **logic commit is mandatory**.

### Balance notes

- Can completely scramble threats — highest variance power-up.
- Once per match per player may still decide games; consider **once per match total** (shared) if self-play shows chaos.
- AI Tip targeting is a research project; v1 AI skips Tip or picks random legal tip.

### Open questions

- Four side tips vs include 180° flip?
- Cubes only, or dim remapping on `5×5×4`?
- Does Tip end the turn or Tip + place?
- Show trajectory ghosts / landing preview before confirm?
- Should Tip be Drop-mode exclusive for implementation speed?

---

## Suggested implementation phases

### Phase 0 — Foundations + catch loop

- Types: `PowerUpId`, `PowerUpInventory` (`Record<PlayerId, Record<PowerUpId, number>>`), setup toggle `powerUps: boolean`.
- Dual inventory HUD (both players, counts; actionable only for current seat).
- Package swarm overlay: 3 paths from seed, 1 live index, tap hit-test, reveal, award roll.
- Gate place-input during swarm; fire swarm after successful place (post-`finishDrop` when needed).
- AI earner: Bernoulli catch + uniform kind (optional watch animation).
- Online: `package-swarm` / `package-result` + inventory on `state`.
- Self-test: seeded swarm plan + award purity (no DOM).

### Phase 1 — Extra turn

- Spend from inventory; `bonusPlacesRemaining` in `applyPlace`.
- HUD + cancel/refund rules.
- Hotseat → AI spend heuristic (or hold) → online message discipline.
- Self-play optional flag later.

### Phase 2 — Clear row

- `clearAxisLine(board, dims, axis, a, b)` + Drop `repackDrop`.
- Selection UX (explicit axis + cursor first; camera-assist polish after).
- Animations: markers dissolve / fall out.
- Win/draw after repack; online message.

### Phase 3 — Tip field

- Pure `tipBoard` + tests (cube presets).
- Scene: dynamic Rapier settle → snap to logic result.
- Disable on `5×5×4` until remapping is designed.
- Online: logic-authoritative.
- Balance pass with `eval:selfplay` using the logic tip (no graphics).

### Phase 4 — AI spend + balance

- Catch already luck-based; add spend heuristics: Extra when double-place wins / dual threats; Clear when it breaks opponent win-in-1; Tip last resort / random.
- Tune `catchChance`, swarm speed, and per-kind caps via self-play earn model.
- Measure first-player WR with power-ups on/off.

---

## Cross-cutting open questions

1. **Flyby cadence:** after every place (proposal) vs every Nth place / start of turn?
2. **Who catches:** earner only (proposal) vs both players race?
3. **Live package contents:** uniform random kind (proposal) vs weighted / typed silhouettes?
4. **Inventory caps:** max stacks per kind?
5. **Turn cost:** Clear/Tip consume the whole turn (proposal) vs allow place after?
6. **Mode scope:** all power-ups in Free + Drop, or Tip Drop-only at first?
7. **Winning through power-ups:** Extra can win on place 1 or 2; Clear alone cannot win; Tip/repack can win for either seat — confirm desired drama.
8. **Swarm presentation:** 2D overlay (proposal) vs 3D scene props?
9. **Accessibility:** swarm must be catchable via keyboard/focus targets, not tap-only; power-up modes keep nudge/place.

## Non-goals (for this arc)

- Shop / real-money crates / cosmetics-only power-ups
- Diagonal clear, plane clear, bomb-radius clear (separate designs)
- Continuous free-angle tumbling
- Client-authoritative physics deciding online winners
- Fully Tip-aware α-β AI in the first ship
- Perfect AI package aiming (AI uses luck roll by design)

## Recommendation

Lock the **catch mini-game** (cadence, earner-only, dual inventory HUD) before coding spends. Phase 0 ships flyby + empty inventory + Extra as the first spendable kind in Phase 1. Spike `tipBoard` logic early so cubes-only stays honest before Rapier work.

## Decision log

| Topic | Status | Proposal |
| ----- | ------ | -------- |
| Acquisition | **Lean yes** | 3 packages / 1 live / skill catch; luck mini-game |
| Who catches | Open | Earner only; AI uses `catchChance` ≈ 1/3 |
| Cadence | Open | After each successful place while `playing` |
| Inventory UI | **Lean yes** | Always show both players’ kinds + counts |
| Contents | Open | Uniform roll among power-up kinds on live catch |
| Caps | Open | Counts stack; soft cap TBD |
| Extra turn | Open | Two places; skip one turn flip; Drop respects `dropBusy` |
| Clear target | Open | Axis-aligned full lines only; not planes/diagonals |
| Clear turn | Open | Consumes turn; no place after |
| Tip outcome | Open | Logic pack authoritative; Rapier for juice |
| Tip presets | Open | Cubes only in v1 |
| Tip turn | Open | Consumes turn; no place after |
| AI v1 | Open | Luck catch; simple/random spend until heuristics |
