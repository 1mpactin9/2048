// game-over / you-win overlay with action buttons

import { motion } from 'motion/react';
import { GameMode, GameState, Powerup } from '../engine/types';
import type { Gameplay } from '../engine/types';

type Props = {
  gameplay: Gameplay;
  best: number;
  onUndo: () => void;
  onNewGame: () => void;
  onContinueAfterWin: () => void;
  onNavigateClassic?: () => void;
};

export function GameEndOverlay({
  gameplay,
  best,
  onUndo,
  onNewGame,
  onContinueAfterWin,
  onNavigateClassic,
}: Props) {
  const isWin = gameplay.state === GameState.GameWon;
  if (!isWin && gameplay.state !== GameState.GameOver) return null;

  const undoAvailable =
    (gameplay.powerups[Powerup.Undo]?.usesRemaining ?? 0) > 0;

  return (
    <motion.div
      class='pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center'
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div class='bg-near-black/70 absolute inset-0 pointer-events-auto' />
      <div class='bg-sand shadow-xl relative z-10 mx-auto flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col items-center gap-6 overflow-hidden rounded-3xl p-6 text-center pointer-events-auto md:p-8'>
        <div class='text-4xl font-semibold md:text-5xl'>
          {isWin ? 'You Win' : 'Game Over'}
        </div>
        <div class='flex flex-col items-center gap-1 text-sm'>
          <span>
            {gameplay.score} points scored in {gameplay.moveCount} moves.
          </span>
          <span>Best: {best}</span>
        </div>
        <div class='actions-grid relative z-10 mx-auto w-full md:max-w-96'>
          {isWin ? (
            <>
              <button
                class='col-span-full rounded-xl bg-tan px-4 py-3 font-bold text-white shadow-button transition-colors hover:bg-brown'
                onClick={onContinueAfterWin}
              >
                Keep Going
              </button>
              <button
                class='rounded-xl border-2 border-sand bg-off-white px-4 py-3 font-bold text-tan shadow-button transition-colors'
                onClick={onNewGame}
              >
                Start Over
              </button>
            </>
          ) : (
            <>
              {undoAvailable && (
                <button
                  class='rounded-xl bg-tan px-4 py-3 font-bold text-white shadow-button transition-colors hover:bg-brown'
                  onClick={onUndo}
                >
                  Undo
                </button>
              )}
              <button
                class={`rounded-xl px-4 py-3 font-bold text-white shadow-button transition-colors hover:bg-brown ${
                  undoAvailable ? 'bg-tan' : 'col-span-full bg-tan'
                }`}
                onClick={onNewGame}
              >
                Try Again
              </button>
            </>
          )}
          {isWin && gameplay.mode !== GameMode.Classic && onNavigateClassic && (
            <div class='col-span-full flex flex-col items-center gap-1 pt-2 text-sm'>
              <span class='text-tan'>Need a bigger challenge?</span>
              <button
                class='font-medium text-brown underline'
                onClick={onNavigateClassic}
              >
                Try classic mode without powerups!
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}