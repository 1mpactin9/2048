// Core type definitions. No DOM, no side effects.

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export interface Cell {
  /** Stable identity used by the renderer to animate a tile across moves. */
  id: number;
  value: number;
}

/** row-major grid; grid[row][col] is null when empty. */
export type Grid = (Cell | null)[][];

export type GameMode = "standard" | "classic";

export type PowerupType = "undo" | "swap" | "delete";

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

/** A single cell change for delta-encoded backtrack history. */
export interface CellDelta {
  row: number;
  col: number;
  /** null means the cell was emptied; otherwise the new cell value/id. */
  cell: { id: number; value: number } | null;
}

/** One step in the compressed (delta) history. Stores an anchor snapshot and the deltas since it. */
export interface HistoryStep {
  /** Snapshot taken BEFORE this step — needed as anchor for replay. */
  anchor: GameSnapshot;
  /** Ordered list of cell changes that occurred during this step. */
  deltas: CellDelta[];
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
  /**
   * Compressed delta history for unlimited backtrack support via __undo.
   * Each step stores a full anchor snapshot plus only the cells that changed.
   * Capped at MAX_DELTA_HISTORY entries to prevent localStorage bloat.
   */
  deltaHistory?: HistoryStep[];
  /**
   * 32-byte CSPRNG seed (8 uint32, little-endian) for tile spawns. Generated
   * per game and persisted so each game differs. Optional only to tolerate
   * saves made before the CSPRNG existed; `GameSession` derives one if absent.
   */
  rngSeed?: number[];
  /**
   * CSPRNG stream position (uint32 values consumed so far). Persisted so a
   * reloaded game resumes the exact stream instead of restarting it, keeping
   * spawns reproducible from the seed. Optional for the same legacy reason.
   */
  rngCalls?: number;
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
  /**
   * RNG Manipulation / predictive "cheat" mode. When true, the AI peeks the
   * deterministic ChaCha20 spawn stream (see rng.ts) and searches the single
   * predicted outcome per chance node instead of averaging over random spawns -
   * faster and sharper, and the real game spawns from the same stream. Off =>
   * fair (averaging) expectimax. Optional: placeholder engines ignore it.
   */
  manipulate?: boolean;
  /** 32-byte CSPRNG seed (8 uint32) used for spawn prediction (manipulate mode). */
  rngSeed?: number[];
  /** CSPRNG stream position (uint32 values consumed) when manipulate is on. */
  rngCalls?: number;
}

/**
 * An action the auto-play engine can take: a directional move, a power-up, or
 * a signal to stop (no action available). The app applies it to the session.
 */
export type AutoAction =
  | { kind: "move"; dir: Direction }
  | { kind: "swap"; r1: number; c1: number; r2: number; c2: number }
  | { kind: "delete"; row: number; col: number }
  | { kind: "stop" };

/**
 * An auto-play engine. chooseAction may be sync or async (return a Promise) so
 * a Web-Worker- or WASM-backed engine can be dropped in without changing the
 * loop. Return a `stop` action to hand control back to the player.
 */
export interface Engine {
  name: string;
  chooseAction(ctx: EngineContext): AutoAction | Promise<AutoAction>;
}
