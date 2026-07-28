// tutorial step machine — derives the current step from gameplay progress

import { GameState, Powerup } from '../engine/types';
import type { Gameplay } from '../engine/types';

export const TUTORIAL_STEPS = [
  'MoveTiles',
  'MergeInto4',
  'MergeInto8',
  'MergeInto16',
  'UseUndo',
  'OtherPowerups',
  'Done',
] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

// step copy: [title, body]. `↑` etc. rendered literally.
export const TUTORIAL_COPY: Record<TutorialStep, { title: string; body: string }> = {
  MoveTiles: {
    title: 'Welcome to 2048',
    body: 'Use the arrow keys or swipe in any direction to move the tiles.',
  },
  MergeInto4: {
    title: 'Make a match',
    body: 'The tiles all moved in the same direction and a new one appeared. Try moving the 2 and 2 towards each other.',
  },
  MergeInto8: {
    title: 'Boom!',
    body: 'Tiles with the same number join when they touch. Keep going. Can you merge two 4 tiles into an 8?',
  },
  MergeInto16: {
    title: '4 + 4 = 8',
    body: "You're getting the hang of it! Let's increase the difficulty. Merge two 8 tiles into a 16 tile.",
  },
  UseUndo: {
    title: 'Need a do-over?',
    body: 'If you make mistakes, you can use undo. Try it out!',
  },
  OtherPowerups: {
    title: 'Powerups!',
    body: "Undo isn't the only powerup you can use. Try \"Swap Two Tiles\"!",
  },
  Done: {
    title: 'You did it!',
    body: "Keep merging the tiles until you get to 2048! You'll earn powerups each time you create a 128, 256 or 512. Use them wisely. Good luck!",
  },
};

// derive step purely from what the player has achieved so far
export function tutorialStep(g: Gameplay): TutorialStep {
  const highest = g.highestReachedTile;
  const usedUndo = (g.powerups[Powerup.Undo]?.usesCount ?? 0) > 0;
  const usedSwap = (g.powerups[Powerup.SwapTwoTiles]?.usesCount ?? 0) > 0;

  if (usedSwap) return 'Done';
  if (usedUndo) return 'OtherPowerups';
  if (highest >= 16) return 'UseUndo';
  if (highest >= 8) return 'MergeInto16';
  if (highest >= 4) return 'MergeInto8';
  if (g.state === GameState.Fresh && g.moveCount === 0) return 'MoveTiles';
  return 'MergeInto4';
}
