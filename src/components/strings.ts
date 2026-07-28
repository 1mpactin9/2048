// user-facing strings, centralized (english only, per original)

import { Powerup } from '../engine/types';

export const POWERUP_LABELS: Record<Powerup, string> = {
  [Powerup.Undo]: 'Undo',
  [Powerup.TeleportTileToEmptyCell]: 'Teleport',
  [Powerup.RotateOuterRingOfBoard]: 'Rotate',
  [Powerup.SwapTwoTiles]: 'Swap Two Tiles',
  [Powerup.MergeAnyTwoAdjacentTiles]: 'Merge Tiles',
  [Powerup.RemoveTilesByValue]: 'Remove by Value',
  [Powerup.Bomb]: 'Bomb',
};

export const POWERUP_DESCRIPTIONS: Record<Powerup, string> = {
  [Powerup.Undo]: 'Go back one move or cancel the last powerup',
  [Powerup.TeleportTileToEmptyCell]: 'Move a tile to an empty cell',
  [Powerup.RotateOuterRingOfBoard]: 'Turn the outer ring of the board',
  [Powerup.SwapTwoTiles]: 'Exchange the positions of two tiles',
  [Powerup.MergeAnyTwoAdjacentTiles]:
    'Pick tiles that are next to each other regardless of their values',
  [Powerup.RemoveTilesByValue]: 'Remove all tiles with a specific value',
  [Powerup.Bomb]: 'Remove all tiles in a 3x3 area',
};

// selection prompts by selection kind / step
export const SELECTION_PROMPTS = {
  tileAndEmptyCell: ['Choose a tile', 'Pick an empty spot on the board'],
  rotation: ['Choose a direction'],
  multipleTile: ['Choose the first tile', 'Choose the second tile'],
  adjacentTilesDirectional: ['Choose the first tile', 'Pick a neighboring tile'],
  byValue: ['Choose a number'],
  bomb: ['Place the bomb'],
} as const;
