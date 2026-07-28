// individual powerup button — icon, count, tooltip, throb, shortcut

import type { Powerup, Powerups } from '../engine/types';
import { POWERUP_ICONS } from './icons';
import { POWERUP_DESCRIPTIONS, POWERUP_LABELS } from './strings';

type Props = {
  powerup: Powerup;
  powerups: Powerups;
  dark?: boolean;
  index: number; // 0-based, for keyboard shortcut label
  onActivate: (p: Powerup) => void;
};

export function PowerupButton({ powerup, powerups, dark, index, onActivate }: Props) {
  const state = powerups[powerup];
  const available = (state?.usesRemaining ?? 0) > 0;
  const Icon = POWERUP_ICONS[powerup];

  // dark mode: active=bg-near-black, hover=bg-light-grey, idle=bg-light-grey/40
  // light mode: active=bg-tan, hover=bg-leather, idle=bg-leather/30
  return (
    <div class='group relative flex w-screen max-w-12 grow flex-col items-center gap-1'>
      {/* tooltip */}
      <div class='tooltip-material absolute -top-2 z-30 hidden w-max max-w-64 -translate-y-full flex-col gap-1 group-hover:flex'>
        <div class='mb-1 flex items-start gap-2'>
          <span class='font-medium uppercase'>{POWERUP_LABELS[powerup]}</span>
          <span class='shrink-0 opacity-70'>{state?.usesRemaining ?? 0} left</span>
        </div>
        <span class='opacity-70'>{POWERUP_DESCRIPTIONS[powerup]}</span>
        <span class='mt-1 text-[10px] opacity-50'>Digit {index + 1}</span>
      </div>

      <button
        class={`xs:p-2 xs:rounded-lg relative z-40 flex aspect-square w-full shrink items-center justify-center self-stretch rounded-md p-1 text-white transition-[background,shadow] duration-[50ms]
          ${
            dark
              ? available
                ? 'bg-light-grey/40 hover:bg-light-grey active:bg-near-black'
                : 'bg-light-grey/40'
              : available
                ? 'bg-leather/30 hover:bg-leather active:bg-tan'
                : 'bg-leather/30'
          }`}
        disabled={!available}
        onClick={() => onActivate(powerup)}
      >
        <Icon class='aspect-square h-auto w-full max-w-8 min-w-0 shrink' />
        {/* count badge when available */}
        {available && (
          <span class='bg-off-white text-tan absolute -bottom-1 -right-1 rounded-full px-1 py-0.5 text-xs font-semibold leading-none'>
            {state?.usesRemaining}
          </span>
        )}
      </button>
    </div>
  );
}