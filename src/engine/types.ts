// core engine types — pure data, no preact/react imports

export type Position = { x: number; y: number };

// a single tile on the board. previousPosition/merges drive animation
export type Tile = {
  id: number;
  value: number;
  position: Position;
  previousPosition?: Position;
  merges?: [Tile, Tile]; // the two source tiles this tile was merged from
};

// board[y][x] — null = empty cell
export type Board = (Tile | null)[][];

export const Direction = {
  Up: 'up',
  Right: 'right',
  Down: 'down',
  Left: 'left',
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const RotationDirection = {
  Clockwise: 'clockwise',
  CounterClockwise: 'counterClockwise',
} as const;
export type RotationDirection = (typeof RotationDirection)[keyof typeof RotationDirection];

export const GameState = {
  Fresh: 'fresh',
  Playing: 'playing',
  GameOver: 'gameOver',
  GameWon: 'gameWon',
  Selecting: 'selecting', // mid powerup target selection
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export const Powerup = {
  Undo: 'undo',
  TeleportTileToEmptyCell: 'teleportTileToEmptyCell',
  RotateOuterRingOfBoard: 'rotateOuterRingOfBoard',
  SwapTwoTiles: 'swapTwoTiles',
  MergeAnyTwoAdjacentTiles: 'mergeAnyTwoAdjacentTiles',
  RemoveTilesByValue: 'removeTilesByValue',
  Bomb: 'bomb',
} as const;
export type Powerup = (typeof Powerup)[keyof typeof Powerup];

export const GameMode = {
  Tutorial: 'tutorial',
  Standard: 'standard',
  Classic: 'classic',
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

// board visual theme — standard uses dark board, classic uses light
export const BoardTheme = {
  Light: 'light',
  Dark: 'dark',
} as const;
export type BoardTheme = (typeof BoardTheme)[keyof typeof BoardTheme];

// per-powerup runtime counters
export type PowerupState = {
  usesRemaining: number;
  usesCount: number;
};

export type Powerups = Partial<Record<Powerup, PowerupState>>;

// selection kinds, one per powerup that needs targets
export type SelectionKind =
  | 'tileAndEmptyCell'
  | 'rotation'
  | 'multipleTile'
  | 'adjacentTilesDirectional'
  | 'byValue'
  | 'bomb';

// in-progress powerup target selection
export type Selection = {
  powerup: Powerup;
  kind: SelectionKind;
  tile?: Tile | null;
  emptyCell?: Position | null;
  direction?: RotationDirection | null;
  tiles?: Tile[];
  origin?: Tile | null;
  target?: Tile | null;
  value?: number | null;
  position?: Position | null;
};

// board change events, emitted per action for animation
export type Change =
  | { type: 'tileAdded'; position: Position; tileId: number }
  | { type: 'tileMoved'; tileId: number; from: Position; to: Position }
  | { type: 'tileMerged'; tileA: Tile; tileB: Tile; resultingTile: Tile }
  | { type: 'tileRemoved'; tileId: number; position: Position }
  | {
      type: 'twoTilesSwapped';
      tileA: { tileId: number; position: Position };
      tileB: { tileId: number; position: Position };
    }
  | {
      type: 'outerRingRotated';
      direction: RotationDirection;
      tiles: { tileId: number; position: Position }[];
    }
  | { type: 'powerupAccrued'; powerup: Powerup }
  | { type: 'powerupConsumed'; powerup: Powerup };

// serializable rng state
export type RngState = { seed: string; state: unknown };

// the full game state for one mode
export type Gameplay = {
  mode: GameMode;
  board: Board;
  score: number;
  moveCount: number;
  highestReachedTile: number;
  state: GameState;
  powerups: Powerups;
  selection: Selection | null;
  rng: RngState;
  changes: Change[];
  previousGameplay: Gameplay | null;
  lastAction: string | null;
};

// reducer actions
export type Action =
  | { type: 'newGame'; seed?: string }
  | { type: 'move'; direction: Direction }
  | { type: 'activatePowerup'; powerup: Powerup }
  | { type: 'completePowerup' }
  | { type: 'cancelPowerup' }
  | { type: 'select'; target: SelectTarget }
  | { type: 'continueAfterWin' };

// a selection target from the UI
export type SelectTarget =
  | { kind: 'tile'; tile: Tile }
  | { kind: 'cell'; position: Position }
  | { kind: 'direction'; direction: RotationDirection };
