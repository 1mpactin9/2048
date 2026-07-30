import type { Powerups } from "../types/game";

export const SIZES = [3, 4, 5, 6, 8] as const;
export type Size = (typeof SIZES)[number];
export const DEFAULT_SIZE: Size = 4;

export const DEFAULT_MODE = "standard" as const;

export const WIN_VALUE = 2048;

export const SPAWN_PROB_4 = 0.1;

export const POWERUP_QUOTA: Powerups = { undo: 2, swap: 2, delete: 2 };

export const MAX_HISTORY = 16;

export const STORAGE_KEY = "2048:v1";

export const TILE_FONT_SCALE: Record<number, number> = {
  1000: 3.0,
  10000: 2.5,
  100000: 2.0,
  1000000: 1.5,
};

export function gameKey(size: number, mode: string): string {
  return `${size}:${mode}`;
}