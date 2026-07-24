<div align="center">
    <h1>2048 Engine</h1>
    <p>
        <a href="#prerequisites">Prerequisites</a> •
        <a href="#quick-start">Installation</a> •
        <a href="#build">Development</a>
    </p>
</div>

A clean, responsive 2048 game built with TypeScript, Vite, and a Rust/WASM game engine.

## Prerequisites

| Tool | Why | Minimum version |
|------|-----|-----------------|
| [Node.js](https://nodejs.org) | Package manager & dev server | 18+ |
| [Rust + Cargo](https://rustup.rs) | Compile the WASM game engine | Latest stable |
| [wasm-pack](https://rustwasm.github.io/wasm-pack/) | Bridge Rust → WebAssembly | latest |

Install Rust + Cargo first, then:

```bash
cargo install wasm-pack
```

## Quick start

```bash
npm install          # install dependencies
npm run dev          # start the dev server at http://localhost:5173
```

## Build

Run this sequence to start from a completely clean state:

```bash
# 1. Remove all generated artifacts
rm -rf node_modules dist engine/pkg/engine2048_bg.wasm engine/pkg/engine2048.js engine/pkg/engine2048.d.ts

# 2. Reinstall dependencies
npm install

# 3. Full build — compiles WASM, type-checks, then bundles
npm run build
```

This does three things in order:

1. **`npm run build:wasm`** — Compiles `engine/` (Rust) into a `.wasm` binary via `wasm-pack`, targeting the web. Output lands in `engine/pkg/`.
2. **`tsc --noEmit`** — Type-checks all TypeScript with zero emit. Catches errors before bundling.
3. **`vite build`** — Bundles the app (HTML, CSS, JS, WASM) into `dist/` for production.

## Verification

```bash
# Run the test suite
npm test

# Build and preview the production bundle locally
npm run build
npm run preview
```

In the preview, check:

- **Gameplay** — tiles merge correctly on swipe / arrow-key input
- **WASM engine** — AI move suggestion (if exposed) runs without console errors
- **Theme toggle** — light/dark mode switches cleanly
- **Responsive** — board scales on different viewport sizes

## Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | WASM + type-check + Vite production build |
| `npm run build:wasm` | Compile the Rust engine to WASM only |
| `npm run preview` | Preview the production `dist/` bundle locally |
| `npm test` | Run Vitest test suite (node environment) |
| `npm run test:watch` | Run Vitest in watch mode |
