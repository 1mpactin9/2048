# 2048 (next) — Project Log

A ground-up rebuild of the 2048 puzzle game in `next/`, following
`spec/architecture.md`. Presentation-layer focus: playable game UI that
replicates the play2048.co look, layout, and animations, plus light/dark theme
support as the one deliberate difference. No AI engine is wired in this build.

## Stack

- Svelte 5 (runes) + Vite 6 + Tailwind v4
- popmotion (tile spring animations)
- valibot (persisted-state validation)
- seedrandom (deterministic spawns)
- throttle-debounce (debounced save)
- lucide-svelte (powerup icons)
- svelte-spa-router (hash routing)

## Layout

- `frontend/` — the app (fully implemented)
- `backend/` — Rust engine structure as empty stubs only (no implementation)

## Routes

- `/` Standard (powerups) · `/classic` (no powerups) · `/plus` (extra powerups,
  dark board) · `/learn` (tutorial) · `/about`
- `/engine` intentionally omitted (no engine in this build)

## Controls

- Move: Arrow keys / WASD / IJKL / touch swipe
- New game: N or R · Undo: 1 · Swap: 2 · Delete: 3

## Progress

- [x] Phase 0 — Scaffold: package.json, vite/tailwind/tsconfig/svelte configs,
  index.html, Rubik fonts, favicon
- [x] Phase 1 — Types + pure logic: `types/game.ts`, `game/grid.ts`,
  `game/move.ts`, `game/session.ts`, `game/rng.ts`, `game/constants.ts`,
  `game/colors.ts` (reimplemented fresh; every tile has a stable id + move
  transcript for animation)
- [x] Phase 2 — Theme + styling: `theme.css` (palette), `global.css` (Rubik,
  Tailwind, board sizing vars), `animations.css`
- [x] Phase 3 — Game context: `context/game.svelte.ts` (runes state wrapping
  GameSession), `context/input.ts` (keyboard + touch), `context/theme.ts`,
  `context/wasm.ts` (stub)
- [x] Phase 4 — Components: `Tile`, `Board`, `Header`, `Controls`, `Game`;
  `EngineStats`/`Debug` empty stubs
- [x] Phase 5 — App shell + routes: `App.svelte`, `main.ts`, `routes.ts`, five
  page wrappers
- [x] Phase 7 — Rust stubs + tests: `backend/` empty stub tree; Vitest suites
  (core, session, storage, validate, input, board, integration) — 35 tests
  passing
- [x] Phase 6 — Persistence + a11y polish: debounced per-`{size:mode}` save,
  resume-on-load, theme persistence + system listener, reduced-motion support,
  ARIA labels + live score region; Plus mode dark board

## Verification status

- `npm run build` — passes (svelte-check 0 errors / 0 warnings; vite build OK)
- `npm test` — 35/35 passing across 7 files
- Per project memory: verified via build + tests, not browser previews

## Notes / decisions

- Game rules reimplemented independently of the parent `2048/` project; the
  parent was referenced for correctness only (no copy-paste), and the
  play2048.co deobfuscated source was not copied.
- Plus mode grants 3 charges of each powerup and defaults the board to a dark
  theme feel; Standard grants 2 each; Classic grants none.
- popmotion springs drive tile slide and spawn/merge pop; all motion respects
  `prefers-reduced-motion`.
