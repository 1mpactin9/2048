// Core type definitions. No DOM, no side effects - safe to import from UI,
// tests, or a future auto-play engine.

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export interface Cell {
  /** Stable identity used by the renderer to animate a tile across moves. */
  id: number;
  value: number;
}

/** row-major grid; grid[row][col] is null when empty. */
export type Grid = (Cell | null)[][];

export type GameMode = 'standard' | 'classic';

export type PowerupType = 'undo' | 'swap' | 'delete';

export interface Powerups {
  undo: number;
  swap: number;
  delete: number;
}

/**
 * Describes one tile's journey during a move. The renderer reads these to
 * drive slide/merge/pop animations without re-deriving any game logic.
 */
export interface TileMove {
  id: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  /** When set, this tile was absorbed into another tile (id) and should be removed after sliding. */
  mergedInto?: number;
  /** When set, this tile is the survivor of a merge and its value changed. */
  newValue?: number;
}

export interface SpawnedTile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface MoveTranscript {
  moved: boolean;
  moves: TileMove[];
  spawned?: SpawnedTile;
  gained: number;
}

/** A full snapshot of play state, used for undo. */
export interface GameSnapshot {
  grid: Grid;
  score: number;
  powerups: Powerups;
  won: boolean;
  wonAcknowledged: boolean;
  over: boolean;
  moveCount: number;
}

export interface GameState {
  size: number;
  mode: GameMode;
  grid: Grid;
  score: number;
  best: number;
  powerups: Powerups;
  won: boolean;
  /** True once the player dismisses the win banner; they keep playing past 2048. */
  wonAcknowledged: boolean;
  over: boolean;
  history: GameSnapshot[];
  moveCount: number;
}

/** Read-only view handed to an auto-play engine. */
export interface EngineContext {
  grid: Grid;
  size: number;
  score: number;
  /** Remaining power-up charges the AI may spend (when `usePowerups`). */
  powerups: Powerups;
  /** Search depth override (0 = engine's adaptive default per board size). */
  depth: number;
  /** Whether the AI may spend power-up charges to avoid game over. */
  usePowerups: boolean;
}

/**
 * An action the auto-play engine can take: a directional move, a power-up, or
 * a signal to stop (no action available). The app applies it to the session.
 */
export type AutoAction =
  | { kind: 'move'; dir: Direction }
  | { kind: 'swap'; r1: number; c1: number; r2: number; c2: number }
  | { kind: 'delete'; row: number; col: number }
  | { kind: 'stop' };

/**
 * An auto-play engine. chooseAction may be sync or async (return a Promise) so
 * a Web-Worker- or WASM-backed engine can be dropped in without changing the
 * loop. Return a `stop` action to hand control back to the player.
 */
export interface Engine {
  name: string;
  chooseAction(ctx: EngineContext): AutoAction | Promise<AutoAction>;
}
