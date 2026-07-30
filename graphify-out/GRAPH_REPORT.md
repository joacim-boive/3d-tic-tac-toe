# Graph Report - .  (2026-07-30)

## Corpus Check
- Corpus is ~6,004 words - fits in a single context window. You may not need a graph.

## Summary
- 176 nodes · 329 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 1,451 input · 2,003 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Dependencies|App Dependencies]]
- [[_COMMUNITY_Game Canvas UI|Game Canvas UI]]
- [[_COMMUNITY_Zustand Game Store|Zustand Game Store]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Board Win Logic|Board Win Logic]]
- [[_COMMUNITY_Ray Picking Cursor|Ray Picking Cursor]]
- [[_COMMUNITY_Oxlint Rules|Oxlint Rules]]
- [[_COMMUNITY_Oxfmt Config|Oxfmt Config]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_MVP Design Docs|MVP Design Docs]]
- [[_COMMUNITY_Player Markers|Player Markers]]
- [[_COMMUNITY_Root Layout Meta|Root Layout Meta]]
- [[_COMMUNITY_Next Config|Next Config]]

## God Nodes (most connected - your core abstractions)
1. `useGameStore` - 17 edges
2. `compilerOptions` - 16 edges
3. `cellKey()` - 14 edges
4. `scripts` - 12 edges
5. `checkWin()` - 10 edges
6. `cellToWorld()` - 10 edges
7. `getPreset()` - 10 edges
8. `BoardDims` - 9 edges
9. `pickCellAlongRay()` - 8 edges
10. `createEmptyBoard()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Voxel Toe MVP Design` --conceptually_related_to--> `Voxel Toe`  [INFERRED]
  docs/plans/2026-07-30-3d-tic-tac-toe-mvp-design.md → README.md
- `Simple AI Opponent` --conceptually_related_to--> `Win Detection Algorithm`  [INFERRED]
  README.md → docs/plans/2026-07-30-3d-tic-tac-toe-mvp-design.md
- `HomePage()` --calls--> `useGameStore`  [EXTRACTED]
  src/app/page.tsx → src/game/store.ts
- `SelectionCursor()` --calls--> `cellKey()`  [EXTRACTED]
  src/scene/SelectionCursor.tsx → src/game/board.ts
- `checkWin()` --calls--> `winLength()`  [EXTRACTED]
  src/game/board.ts → src/game/types.ts

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "App Dependencies"
Cohesion: 0.08
Nodes (23): dependencies, next, react, react-dom, @react-three/drei, @react-three/fiber, three, zustand (+15 more)

### Community 1 - "Game Canvas UI"
Cohesion: 0.18
Nodes (16): GameCanvas, HomePage(), getPreset(), useGameStore, PLAYER_LABELS, camDistance(), GameCanvas(), SceneContent() (+8 more)

### Community 2 - "Zustand Game Store"
Cohesion: 0.19
Nodes (16): isDraw(), randomEmptyCell(), assertDims(), PRESETS, clearAiTimer(), GameState, scheduleAiMove(), CellCoord (+8 more)

### Community 3 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 4 - "Board Win Logic"
Cohesion: 0.28
Nodes (17): Board, cellKey(), checkWin(), countAlong(), createEmptyBoard(), inBounds(), LINE_DIRECTIONS, WinResult (+9 more)

### Community 5 - "Ray Picking Cursor"
Cohesion: 0.29
Nodes (11): cellToWorld(), BoardDims, PLAYER_COLORS, pickCellAlongRay(), PickCellAlongRayArgs, assert(), testCornerCell(), testHitsFrontCellAlongRay() (+3 more)

### Community 6 - "Oxlint Rules"
Cohesion: 0.17
Nodes (11): categories, correctness, env, builtin, ignorePatterns, plugins, rules, react/exhaustive-deps (+3 more)

### Community 7 - "Oxfmt Config"
Cohesion: 0.20
Nodes (9): bracketSpacing, ignorePatterns, printWidth, $schema, semi, singleQuote, tabWidth, trailingComma (+1 more)

### Community 8 - "Dev Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, oxfmt, oxlint, tsx, @types/node, @types/react, @types/react-dom, @types/three (+2 more)

### Community 9 - "MVP Design Docs"
Cohesion: 0.25
Nodes (9): InstancedMesh Marker Pools, Game Presets, Voxel Toe MVP Design, Win Detection Algorithm, Simple AI Opponent, Next.js, React Three Fiber, Voxel Toe (+1 more)

### Community 10 - "Player Markers"
Cohesion: 0.33
Nodes (5): parseCellKey(), Markers(), MarkersProps, PlayerMarkers(), temp

## Knowledge Gaps
- **81 isolated node(s):** `$schema`, `semi`, `singleQuote`, `trailingComma`, `printWidth` (+76 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useGameStore` connect `Game Canvas UI` to `Zustand Game Store`, `Player Markers`, `Ray Picking Cursor`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Dependencies` to `App Dependencies`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `$schema`, `semi`, `singleQuote` to the rest of the system?**
  _81 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._