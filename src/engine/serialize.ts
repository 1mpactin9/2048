// localStorage persistence for gameplay + best score

import { bumpIdFloor } from './grid';
import { GameMode } from './types';
import type { Gameplay } from './types';

const GAME_KEY = (mode: GameMode) => `2048:gameState:${mode}`;
const BEST_KEY = '2048:bestScore';

// gameplay is JSON-serializable (rng.state is plain object from seedrandom)
export function saveGameplay(g: Gameplay): void {
  try {
    // never persist a mid-selection state — fall back to the snapshot
    const toSave =
      g.state === 'selecting' && g.previousGameplay ? g.previousGameplay : g;
    localStorage.setItem(GAME_KEY(g.mode), JSON.stringify({ ...toSave, changes: [] }));
  } catch {
    // storage unavailable / quota — ignore
  }
}

export function loadGameplay(mode: GameMode): Gameplay | null {
  try {
    const raw = localStorage.getItem(GAME_KEY(mode));
    if (!raw) return null;
    const g = JSON.parse(raw) as Gameplay;
    // keep the id generator ahead of restored tile ids
    let maxId = 0;
    for (const row of g.board) for (const cell of row) if (cell && cell.id > maxId) maxId = cell.id;
    bumpIdFloor(maxId + 1);
    return { ...g, changes: [] };
  } catch {
    return null;
  }
}

export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

// monotonic — only ever increases
export function saveBestScore(score: number): number {
  const current = loadBestScore();
  const next = Math.max(current, score);
  try {
    localStorage.setItem(BEST_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
}
