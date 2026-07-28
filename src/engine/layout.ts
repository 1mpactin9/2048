// board pixel model -> percentages so the square board scales responsively

import { GRID_SIZE } from './constants';

export const CELL = 100; // logical cell size
export const GAP = 12; // gap between cells
export const PAD = 12; // board inner padding

// total logical board edge length
export const BOARD_EDGE = PAD * 2 + CELL * GRID_SIZE + GAP * (GRID_SIZE - 1);

// percentage offset of a cell/tile at grid index i
export function cellOffsetPct(i: number): number {
  return ((PAD + i * (CELL + GAP)) / BOARD_EDGE) * 100;
}

// percentage size of one cell/tile
export const CELL_PCT = (CELL / BOARD_EDGE) * 100;
export const GAP_PCT = (GAP / BOARD_EDGE) * 100;
export const PAD_PCT = (PAD / BOARD_EDGE) * 100;
