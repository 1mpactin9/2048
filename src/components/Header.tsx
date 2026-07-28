// header — title, score/best boxes, menu + new game buttons
// two layouts: classic (single row) and standard (two rows, split score)

import { GameMode } from '../engine/types';
import { MenuIcon } from './icons';
import { ScoreBox } from './ScoreBox';

type Props = {
  mode: GameMode;
  score: number;
  best: number;
  onMenu: () => void;
  onNewGame: () => void;
};

function NewGameButton({ onNewGame }: { onNewGame: () => void }) {
  return (
    <button
      class='relative flex items-center gap-2 rounded-xl bg-tan px-4 py-2 text-sm font-bold text-white shadow-button transition-colors hover:bg-brown sm:text-base'
      onClick={onNewGame}
    >
      New Game
    </button>
  );
}

function MenuButton({ onMenu }: { onMenu: () => void }) {
  return (
    <button
      class='relative z-30 flex items-center gap-2 rounded-xl p-1 px-2 text-tan transition-colors duration-75 hover:bg-beige'
      aria-label='Menu'
      onClick={onMenu}
    >
      <MenuIcon class='size-7' />
    </button>
  );
}

export function Header({ mode, score, best, onMenu, onNewGame }: Props) {
  const classic = mode === GameMode.Classic;

  if (classic) {
    // single row: [menu] [score+best] [new game]
    return (
      <header class='grid grid-cols-[1fr_min-content_1fr] items-center gap-x-1 px-2 pt-2'>
        <div class='flex items-center'>
          <MenuButton onMenu={onMenu} />
        </div>
        <div class='flex items-center gap-3'>
          <ScoreBox primary label='Score' value={score} />
          <ScoreBox label='Best' value={best} />
        </div>
        <div class='flex items-center justify-end gap-3'>
          <NewGameButton onNewGame={onNewGame} />
        </div>
      </header>
    );
  }

  // standard: two rows. top: [menu] [2048] [new game]; bottom: [score] . [best]
  return (
    <header
      class='grid items-center gap-x-1 gap-y-1.5 px-2 pt-2'
      style={{
        gridTemplateColumns: '[left] 1fr [center] min-content [right] 1fr',
        gridTemplateRows: '[top] min-content [bottom] min-content',
      }}
    >
      <div class='col-[left] row-[top] flex items-center'>
        <MenuButton onMenu={onMenu} />
      </div>
      <h1 class='col-[center] row-[top] flex items-center justify-center text-3xl font-bold text-brown'>
        2048
      </h1>
      <div class='col-[right] row-[top] flex items-center justify-end pr-1'>
        <NewGameButton onNewGame={onNewGame} />
      </div>
      <div class='col-[left] row-[bottom]'>
        <ScoreBox primary label='Score' value={score} />
      </div>
      <div class='col-[right] row-[bottom]'>
        <ScoreBox label='Best' value={best} />
      </div>
    </header>
  );
}
