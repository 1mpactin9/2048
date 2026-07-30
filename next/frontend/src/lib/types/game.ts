export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export type GameMode = "standard" | "classic" | "plus";

export type PowerupType = "undo" | "swap" | "delete";

export interface Tile {
  id: number;
  value: number;
}

export type Grid = (Tile | null)[][];

export interface Powerups {
  undo: number;
  swap: number;
  delete: number;
}

export interface TileMove {
  id: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  mergedInto?: number;
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
  wonAcknowledged: boolean;
  over: boolean;
  history: GameSnapshot[];
  moveCount: number;
}

export type Theme = "light" | "dark" | "system";

// UI-facing tile with board position, used by the render layer for keyed animation.
export interface RenderTile {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew: boolean;
  isMerged: boolean;
}
