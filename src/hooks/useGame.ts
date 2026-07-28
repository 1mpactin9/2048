// game state hook — reducer + persistence + action helpers

import { useCallback, useEffect, useReducer, useState } from 'preact/hooks';
import { newGameplay, reducer } from '../engine/reducer';
import {
  loadBestScore,
  loadGameplay,
  saveBestScore,
  saveGameplay,
} from '../engine/serialize';
import {
  Direction,
  GameMode,
  Powerup,
  RotationDirection,
} from '../engine/types';
import type { Action, Position, Tile } from '../engine/types';

// note: caller should key this hook's component by mode so a mode switch remounts
export function useGame(mode: GameMode) {
  const [gameplay, dispatch] = useReducer(
    reducer,
    mode,
    (m) => loadGameplay(m) ?? newGameplay(m),
  );
  const [best, setBest] = useState<number>(() => loadBestScore());

  // persist gameplay + best score on change
  useEffect(() => {
    saveGameplay(gameplay);
    if (gameplay.score > best) setBest(saveBestScore(gameplay.score));
  }, [gameplay, best]);

  const move = useCallback((direction: Direction) => dispatch({ type: 'move', direction }), []);
  const newGame = useCallback(() => dispatch({ type: 'newGame' }), []);
  const activatePowerup = useCallback(
    (powerup: Powerup) => dispatch({ type: 'activatePowerup', powerup }),
    [],
  );
  const selectTile = useCallback(
    (tile: Tile) => dispatch({ type: 'select', target: { kind: 'tile', tile } }),
    [],
  );
  const selectCell = useCallback(
    (position: Position) => dispatch({ type: 'select', target: { kind: 'cell', position } }),
    [],
  );
  const selectDirection = useCallback(
    (direction: RotationDirection) =>
      dispatch({ type: 'select', target: { kind: 'direction', direction } }),
    [],
  );
  const cancelPowerup = useCallback(() => dispatch({ type: 'cancelPowerup' }), []);
  const continueAfterWin = useCallback(() => dispatch({ type: 'continueAfterWin' }), []);
  const undo = useCallback(() => dispatch({ type: 'activatePowerup', powerup: Powerup.Undo }), []);

  return {
    gameplay,
    best,
    dispatch: dispatch as (a: Action) => void,
    move,
    newGame,
    activatePowerup,
    selectTile,
    selectCell,
    selectDirection,
    cancelPowerup,
    continueAfterWin,
    undo,
  };
}

export type UseGame = ReturnType<typeof useGame>;
