// inline svg icons (menu + powerups)

import type { JSX } from 'preact';
import { Powerup } from '../engine/types';

type IconProps = JSX.SVGAttributes<SVGSVGElement>;

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' {...props}>
      <path d='M4 7h16M4 12h16M4 17h16' />
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <path d='M9 14 4 9l5-5' />
      <path d='M4 9h11a5 5 0 0 1 0 10h-4' />
    </svg>
  );
}

function SwapIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <path d='M7 4 3 8l4 4' />
      <path d='M3 8h13' />
      <path d='m17 20 4-4-4-4' />
      <path d='M21 16H8' />
    </svg>
  );
}

function BombIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <circle cx='10' cy='15' r='7' />
      <path d='M15 7 18 4M18 4h3M18 4v3' />
    </svg>
  );
}

function MergeIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <path d='M8 4v6a4 4 0 0 0 4 4 4 4 0 0 1 4 4v2M16 4v6' />
      <path d='m13 17 3 3 3-3' />
    </svg>
  );
}

function RemoveByValueIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <rect x='3' y='3' width='18' height='18' rx='3' />
      <path d='M8 12h8' />
    </svg>
  );
}

function RotateIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <path d='M21 12a9 9 0 1 1-3-6.7' />
      <path d='M21 3v5h-5' />
    </svg>
  );
}

function TeleportIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' {...props}>
      <path d='M12 3v10' />
      <path d='m8 9 4 4 4-4' />
      <ellipse cx='12' cy='18' rx='7' ry='3' />
    </svg>
  );
}

export const POWERUP_ICONS: Record<Powerup, (p: IconProps) => JSX.Element> = {
  [Powerup.Undo]: UndoIcon,
  [Powerup.SwapTwoTiles]: SwapIcon,
  [Powerup.Bomb]: BombIcon,
  [Powerup.MergeAnyTwoAdjacentTiles]: MergeIcon,
  [Powerup.RemoveTilesByValue]: RemoveByValueIcon,
  [Powerup.RotateOuterRingOfBoard]: RotateIcon,
  [Powerup.TeleportTileToEmptyCell]: TeleportIcon,
};
