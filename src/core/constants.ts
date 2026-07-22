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
 * Tile colors per value (same in light and dark - tiles are the focal point).
 * Values above 2048 fall back to SUPER_TILE.
 */
export const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2:    { bg: '#eee4da', fg: '#776e65' },
  4:    { bg: '#ede0c8', fg: '#776e65' },
  8:    { bg: '#f2b179', fg: '#f9f6f2' },
  16:   { bg: '#f59563', fg: '#f9f6f2' },
  32:   { bg: '#f67c5f', fg: '#f9f6f2' },
  64:   { bg: '#f65e3b', fg: '#f9f6f2' },
  128:  { bg: '#edcf72', fg: '#f9f6f2' },
  256:  { bg: '#edcc61', fg: '#f9f6f2' },
  512:  { bg: '#baac9a', fg: '#f9f6f2' },
  1024: { bg: '#988776', fg: '#f9f6f2' },
  2048: { bg: '#756452', fg: '#f9f6f2' },
};

export const SUPER_TILE = { bg: '#3c3a32', fg: '#f9f6f2' };

export function tileColor(value: number): { bg: string; fg: string } {
  return TILE_COLORS[value] ?? SUPER_TILE;
}

export function gameKey(size: number, mode: string): string {
  return `${size}:${mode}`;
}
