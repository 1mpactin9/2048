// engine constants — grid dims, powerup config, tile visuals, timing

import { Direction, GameMode, Powerup } from './types';

export const GRID_SIZE = 4;

// spawn: 90% chance of 2, else 4
export const SPAWN_FOUR_PROBABILITY = 0.1;
export const INITIAL_TILES = 2;

// direction unit vectors
export const DIRECTION_VECTORS: Record<Direction, Position> = {
  [Direction.Up]: { x: 0, y: -1 },
  [Direction.Right]: { x: 1, y: 0 },
  [Direction.Down]: { x: 0, y: 1 },
  [Direction.Left]: { x: -1, y: 0 },
};
type Position = { x: number; y: number };

// win triggers on the move that first reaches 2048
export const WIN_TILE = 2048;

// merge value -> powerups it can top up
export const ACCRUAL_MAP: Record<number, Powerup[]> = {
  128: [Powerup.Undo],
  256: [
    Powerup.SwapTwoTiles,
    Powerup.MergeAnyTwoAdjacentTiles,
    Powerup.TeleportTileToEmptyCell,
    Powerup.RotateOuterRingOfBoard,
  ],
  512: [Powerup.RemoveTilesByValue, Powerup.Bomb],
};

// per-powerup limits and starting uses
export const POWERUP_CONFIG: Record<
  Powerup,
  { usesLimit: number; initialUses: number }
> = {
  [Powerup.Undo]: { usesLimit: 2, initialUses: 2 },
  [Powerup.TeleportTileToEmptyCell]: { usesLimit: 2, initialUses: 1 },
  [Powerup.RotateOuterRingOfBoard]: { usesLimit: 2, initialUses: 1 },
  [Powerup.SwapTwoTiles]: { usesLimit: 2, initialUses: 1 },
  [Powerup.MergeAnyTwoAdjacentTiles]: { usesLimit: 2, initialUses: 0 },
  [Powerup.RemoveTilesByValue]: { usesLimit: 2, initialUses: 0 },
  [Powerup.Bomb]: { usesLimit: 2, initialUses: 0 },
};

// which powerups each mode enables (order = display order)
export const MODE_POWERUPS: Record<GameMode, Powerup[]> = {
  [GameMode.Tutorial]: [
    Powerup.Undo,
    Powerup.SwapTwoTiles,
    Powerup.RemoveTilesByValue,
  ],
  [GameMode.Standard]: [
    Powerup.Undo,
    Powerup.SwapTwoTiles,
    Powerup.RemoveTilesByValue,
  ],
  [GameMode.Classic]: [],
};

// spring config matching the original board feel
export const TILE_SPRING = { type: 'spring' as const, duration: 0.25, bounce: 0.3 };

// tile background + text styling per value; falls back to OVERFLOW above 2048
export type TileStyle = {
  background: string;
  color: string;
  glow?: string;
};

export const TILE_STYLES: Record<number, TileStyle> = {
  2: { background: '#ECE4DB', color: '#756452' },
  4: { background: '#E8D8BA', color: '#756452' },
  8: { background: 'linear-gradient(180deg,#E9B582,#E6AF79)', color: '#ffffff' },
  16: { background: 'linear-gradient(180deg,#E99A6D,#E79362)', color: '#ffffff' },
  32: { background: 'linear-gradient(180deg,#E8886E,#E57A5D)', color: '#ffffff' },
  64: { background: 'linear-gradient(180deg,#E67051,#E26240)', color: '#ffffff' },
  128: {
    background: 'linear-gradient(180deg,#EBD47F,#EDCF64)',
    color: '#ffffff',
    glow: '0 0 12px rgba(237,207,100,0.4)',
  },
  256: {
    background: 'linear-gradient(180deg,#EBD47F,#EDCF64)',
    color: '#ffffff',
    glow: '0 0 14px rgba(237,207,100,0.5)',
  },
  512: {
    background: 'linear-gradient(180deg,#EBD47F,#EDCF64)',
    color: '#ffffff',
    glow: '0 0 16px rgba(237,207,100,0.6)',
  },
  1024: {
    background: 'linear-gradient(180deg,#EBD47F,#EDCF64)',
    color: '#ffffff',
    glow: '0 0 18px rgba(237,207,100,0.7)',
  },
  2048: {
    background: 'linear-gradient(180deg,#EFDB94,#ECD069)',
    color: '#ffffff',
    glow: '0 0 24px rgba(237,207,100,0.85)',
  },
};

export const TILE_OVERFLOW_STYLE: TileStyle = {
  background: 'linear-gradient(180deg,#403A31,#312C26)',
  color: '#C4BDB7',
};

export function tileStyle(value: number): TileStyle {
  return TILE_STYLES[value] ?? TILE_OVERFLOW_STYLE;
}

// font size (px) by digit count of tile value
export function tileFontSize(value: number): number {
  const digits = String(value).length;
  if (digits <= 2) return 48;
  if (digits === 3) return 40;
  return 33;
}
