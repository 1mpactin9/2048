// powerup tray — the mode's powerups above the board (standard/tutorial)

import { MODE_POWERUPS } from '../engine/constants';
import { GameMode } from '../engine/types';
import type { Powerup, Powerups } from '../engine/types';
import { PowerupButton } from './PowerupButton';

type Props = {
  mode: GameMode;
  powerups: Powerups;
  dark?: boolean;
  onActivate: (p: Powerup) => void;
};

export function PowerupBar({ mode, powerups, dark, onActivate }: Props) {
  const list = MODE_POWERUPS[mode];
  if (list.length === 0) return null;

  return (
    <div
      class={`xs:p-3 xs:rounded-3xl relative mx-auto flex max-w-[calc(100vw-20px)] gap-2 rounded-xl p-2 sm:gap-3 ${
        dark ? 'bg-dark-grey' : 'bg-sand'
      }`}
    >
      {list.map((p, i) => (
        <PowerupButton
          key={p}
          powerup={p}
          powerups={powerups}
          dark={dark}
          index={i}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}
