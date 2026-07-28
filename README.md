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
| [Node.js](https://nodejs.org) | package manager | 18+ |
| [Rust + Cargo](https://rustup.rs) | game engine | Latest stable |
| [wasm-pack](https://rustwasm.github.io/wasm-pack/) | rust and webAssembly | latest |

Install Rust + Cargo first, then:

```bash
cargo install wasm-pack
```

## Quick start

```bash
npm install          # install dependencies
npm run dev          # start the dev server
```

## Build

Run this sequence to start from a completely clean state:

```bash
# remove generated artifacts
rm -rf node_modules dist engine/pkg/engine2048_bg.wasm engine/pkg/engine2048.js engine/pkg/engine2048.d.ts

# reinstall dependencies
npm install

# full build
npm run build
```

## Verification

```bash
# run test suite
npm test

# build and preview
npm run build
npm run preview
```

## Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | start dev server |
| `npm run build` | WASM + type-check + build |
| `npm run build:wasm` | compile the Rust engine to WASM only |
| `npm run preview` | preview the production `dist/` bundle locally |
| `npm test` | run Vitest test suite (node environment) |
| `npm run test:watch` | run Vitest in watch mode |

## Quick Access

| Document | Description |
|--------|-------------|
| [Benchmark Result](docs/benchmark.md) | some example benchmark results |
| [Developer Documentation](docs/dev.md) | throuogh project overview |

one thing to note: this repository wasn't made for frontend development, the main focus is the engine, so pls ignore the bad ui quality.