import type { Powerups } from './types';

export const SIZES = [3, 4, 5, 6, 8] as const;
export type Size = (typeof SIZES)[number];
export const DEFAULT_SIZE: Size = 4;

export const DEFAULT_MODE = 'standard' as const;

/** Reaching this tile shows the win banner (you may keep playing). */
export const WIN_VALUE = 2048;

/** Probability that a newly spawned tile is a 4 (otherwise a 2). */
export const SPAWN_PROB_4 = 0.1;

/** Powerup charges granted at the start of each Standard game. */
export const POWERUP_QUOTA: Powerups = { undo: 2, swap: 2, delete: 2 };

/** Bounded undo history so storage stays small. */
export const MAX_HISTORY = 16;

/**
 * Tile colors per value, exposed as CSS custom-property references so the
 * palette can adapt per theme (see --tile-* in base.css).  Values above 2048
 * fall back to SUPER_TILE.
 */
export const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2:         { bg: 'var(--tile-2-bg)', fg: 'var(--tile-2-fg)' },
  4:         { bg: 'var(--tile-4-bg)', fg: 'var(--tile-4-fg)' },
  8:         { bg: 'var(--tile-8-bg)', fg: 'var(--tile-8-fg)' },
  16:        { bg: 'var(--tile-16-bg)', fg: 'var(--tile-16-fg)' },
  32:        { bg: 'var(--tile-32-bg)', fg: 'var(--tile-32-fg)' },
  64:        { bg: 'var(--tile-64-bg)', fg: 'var(--tile-64-fg)' },
  128:       { bg: 'var(--tile-128-bg)', fg: 'var(--tile-128-fg)' },
  256:       { bg: 'var(--tile-256-bg)', fg: 'var(--tile-256-fg)' },
  512:       { bg: 'var(--tile-512-bg)', fg: 'var(--tile-512-fg)' },
  1024:      { bg: 'var(--tile-1024-bg)', fg: 'var(--tile-1024-fg)' },
  2048:      { bg: 'var(--tile-2048-bg)', fg: 'var(--tile-2048-fg)' },
  4096:      { bg: 'var(--tile-4096-bg)', fg: 'var(--tile-4096-fg)' },
  8192:      { bg: 'var(--tile-8192-bg)', fg: 'var(--tile-8192-fg)' },
  16384:     { bg: 'var(--tile-16384-bg)', fg: 'var(--tile-16384-fg)' },
  32768:     { bg: 'var(--tile-32768-bg)', fg: 'var(--tile-32768-fg)' },
  65536:     { bg: 'var(--tile-65536-bg)', fg: 'var(--tile-65536-fg)' },
  131072:    { bg: 'var(--tile-131072-bg)', fg: 'var(--tile-131072-fg)' },
  262144:    { bg: 'var(--tile-262144-bg)', fg: 'var(--tile-262144-fg)' },
  524288:    { bg: 'var(--tile-524288-bg)', fg: 'var(--tile-524288-fg)' },
  1048576:   { bg: 'var(--tile-1048576-bg)', fg: 'var(--tile-1048576-fg)' },
};

export const SUPER_TILE = { bg: 'var(--tile-super-bg)', fg: 'var(--tile-super-fg)' };

export function tileColor(value: number): { bg: string; fg: string } {
  return TILE_COLORS[value] ?? SUPER_TILE;
}

export function gameKey(size: number, mode: string): string {
  return `${size}:${mode}`;
}
