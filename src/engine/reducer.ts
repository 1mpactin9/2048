// main game reducer — pure state transitions for one gameplay

import {
  ACCRUAL_MAP,
  INITIAL_TILES,
  MODE_POWERUPS,
  POWERUP_CONFIG,
} from './constants';
import { createBoard, getCell, highestTile } from './grid';
import { isGameOver, isWin, move, spawnTile } from './logic';
import { POWERUP_HANDLERS, isSelectionComplete } from './powerups';
import { createRng, restoreRng } from './rng';
import {
  GameMode,
  GameState,
  Powerup,
  RotationDirection,
} from './types';
import type {
  Action,
  Board,
  Change,
  Gameplay,
  Powerups,
  SelectTarget,
  Selection,
} from './types';

// build fresh powerup counters for a mode
function initialPowerups(mode: GameMode): Powerups {
  const powerups: Powerups = {};
  for (const p of MODE_POWERUPS[mode]) {
    powerups[p] = { usesRemaining: POWERUP_CONFIG[p].initialUses, usesCount: 0 };
  }
  return powerups;
}

// create a new game: empty board + 2 spawned tiles
export function newGameplay(mode: GameMode, seed?: string, board?: Board): Gameplay {
  const rng = createRng(seed);
  let b = board ?? createBoard();
  if (!board) {
    for (let i = 0; i < INITIAL_TILES; i++) b = spawnTile(b, rng).board;
  }
  return {
    mode,
    board: b,
    score: 0,
    moveCount: 0,
    highestReachedTile: highestTile(b) || 2,
    state: GameState.Fresh,
    powerups: initialPowerups(mode),
    selection: null,
    rng: rng.state(),
    changes: [],
    previousGameplay: null,
    lastAction: null,
  };
}

// snapshot for undo (drop the nested previousGameplay to bound memory)
function snapshot(g: Gameplay): Gameplay {
  return { ...g, previousGameplay: null, changes: [] };
}

// grant +1 use to the lowest-remaining powerup among a merged value's group
function accruePowerups(
  powerups: Powerups,
  mergedValues: number[],
): { powerups: Powerups; changes: Change[] } {
  const next: Powerups = { ...powerups };
  const changes: Change[] = [];
  for (const value of mergedValues) {
    const group = ACCRUAL_MAP[value];
    if (!group) continue;
    const candidates = group
      .filter((p) => next[p] && next[p]!.usesRemaining < POWERUP_CONFIG[p].usesLimit)
      .sort((a, b) => next[a]!.usesRemaining - next[b]!.usesRemaining);
    const winner = candidates[0];
    if (winner) {
      next[winner] = { ...next[winner]!, usesRemaining: next[winner]!.usesRemaining + 1 };
      changes.push({ type: 'powerupAccrued', powerup: winner });
    }
  }
  return { powerups: next, changes };
}

// consume one use of a powerup
function consume(powerups: Powerups, p: Powerup): Powerups {
  const cur = powerups[p];
  if (!cur) return powerups;
  return {
    ...powerups,
    [p]: { usesRemaining: Math.max(0, cur.usesRemaining - 1), usesCount: cur.usesCount + 1 },
  };
}

// recompute highest tile + terminal state after any action
function resolveState(g: Gameplay): Gameplay {
  const highest = Math.max(g.highestReachedTile, highestTile(g.board));
  const prevHighest = g.previousGameplay?.highestReachedTile ?? g.highestReachedTile;
  let next = { ...g, highestReachedTile: highest };
  if (
    next.state === GameState.Selecting ||
    next.state === GameState.Fresh ||
    next.state === GameState.GameWon ||
    next.state === GameState.GameOver
  ) {
    return next;
  }
  if (isWin(prevHighest, highest)) {
    return { ...next, state: GameState.GameWon };
  }
  if (isGameOver(next.board)) {
    return { ...next, state: GameState.GameOver };
  }
  return next;
}

// advance an in-progress selection with a new target
function applySelectTarget(sel: Selection, target: SelectTarget): Selection {
  const next: Selection = { ...sel };
  switch (sel.kind) {
    case 'tileAndEmptyCell':
      if (!next.tile && target.kind === 'tile') next.tile = target.tile;
      else if (next.tile && target.kind === 'cell') next.emptyCell = target.position;
      break;
    case 'rotation':
      if (target.kind === 'direction') next.direction = target.direction;
      break;
    case 'multipleTile':
      if (target.kind === 'tile') {
        const tiles = next.tiles ?? [];
        if (!tiles.some((t) => t.id === target.tile.id)) next.tiles = [...tiles, target.tile];
      }
      break;
    case 'adjacentTilesDirectional':
      if (!next.origin && target.kind === 'tile') next.origin = target.tile;
      else if (next.origin && target.kind === 'tile') next.target = target.tile;
      break;
    case 'byValue':
      if (target.kind === 'tile') next.value = target.tile.value;
      break;
    case 'bomb':
      if (target.kind === 'cell') next.position = target.position;
      break;
  }
  return next;
}

export function reducer(g: Gameplay, action: Action): Gameplay {
  switch (action.type) {
    case 'newGame':
      return newGameplay(g.mode, action.seed);

    case 'move': {
      if (
        g.state === GameState.GameOver ||
        g.state === GameState.GameWon ||
        g.state === GameState.Selecting
      )
        return g;
      const result = move(g.board, action.direction);
      if (!result.anyMoved) return g;
      const rng = restoreRng(g.rng);
      const spawned = spawnTile(result.board, rng);
      const changes = [...result.changes];
      if (spawned.change) changes.push(spawned.change);
      const mergedValues = result.changes
        .filter((c): c is Extract<Change, { type: 'tileMerged' }> => c.type === 'tileMerged')
        .map((c) => c.resultingTile.value);
      const accrued = accruePowerups(g.powerups, mergedValues);
      const next: Gameplay = {
        ...g,
        board: spawned.board,
        score: g.score + result.score,
        moveCount: g.moveCount + 1,
        powerups: accrued.powerups,
        rng: rng.state(),
        changes: [...changes, ...accrued.changes],
        previousGameplay: snapshot(g),
        state: GameState.Playing,
        lastAction: 'move',
      };
      return resolveState(next);
    }

    case 'activatePowerup': {
      const p = action.powerup;
      const handler = POWERUP_HANDLERS[p];
      const state = g.powerups[p];
      if (
        g.state === GameState.Selecting ||
        !state ||
        state.usesRemaining <= 0 ||
        !handler.available(g)
      )
        return g;
      const result = handler.activate(g);
      if (result.kind === 'unavailable') return g;
      if (result.kind === 'activatedAndCompleted') {
        return {
          ...result.gameplay,
          powerups: consume(result.gameplay.powerups, p),
          lastAction: `powerup:${p}`,
        };
      }
      // begin selection
      return {
        ...g,
        state: GameState.Selecting,
        selection: result.selection,
        previousGameplay: snapshot(g),
        changes: [],
        lastAction: `activate:${p}`,
      };
    }

    case 'select': {
      if (g.state !== GameState.Selecting || !g.selection) return g;
      const selection = applySelectTarget(g.selection, action.target);
      const withSelection = { ...g, selection };
      if (!isSelectionComplete(selection)) return withSelection;
      return reducer(withSelection, { type: 'completePowerup' });
    }

    case 'completePowerup': {
      if (g.state !== GameState.Selecting || !g.selection) return g;
      const p = g.selection.powerup;
      const handler = POWERUP_HANDLERS[p];
      const result = handler.complete?.(g, g.selection) ?? null;
      if (!result) return g;
      const next: Gameplay = {
        ...g,
        board: result.board,
        score: g.score + (result.scoreDelta ?? 0),
        powerups: consume(g.powerups, p),
        selection: null,
        state: GameState.Playing,
        changes: result.changes,
        lastAction: `complete:${p}`,
      };
      return resolveState(next);
    }

    case 'cancelPowerup': {
      if (g.state !== GameState.Selecting || !g.previousGameplay) return g;
      return { ...g.previousGameplay, changes: [], lastAction: 'cancelPowerup' };
    }

    case 'continueAfterWin': {
      if (g.state !== GameState.GameWon) return g;
      return {
        ...g,
        state: GameState.Playing,
        previousGameplay: null,
        changes: [],
        lastAction: 'continueAfterWin',
      };
    }

    default:
      return g;
  }
}

export { getCell, RotationDirection };
