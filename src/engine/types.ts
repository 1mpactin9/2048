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

export enum Direction {
  Up = 'up',
  Right = 'right',
  Down = 'down',
  Left = 'left',
}

export enum RotationDirection {
  Clockwise = 'clockwise',
  CounterClockwise = 'counterClockwise',
}

export enum GameState {
  Fresh = 'fresh',
  Playing = 'playing',
  GameOver = 'gameOver',
  GameWon = 'gameWon',
  Selecting = 'selecting', // mid powerup target selection
}

export enum Powerup {
  Undo = 'undo',
  TeleportTileToEmptyCell = 'teleportTileToEmptyCell',
  RotateOuterRingOfBoard = 'rotateOuterRingOfBoard',
  SwapTwoTiles = 'swapTwoTiles',
  MergeAnyTwoAdjacentTiles = 'mergeAnyTwoAdjacentTiles',
  RemoveTilesByValue = 'removeTilesByValue',
  Bomb = 'bomb',
}

export enum GameMode {
  Tutorial = 'tutorial',
  Standard = 'standard',
  Classic = 'classic',
}

// board visual theme — standard uses dark board, classic uses light
export enum BoardTheme {
  Light = 'light',
  Dark = 'dark',
}

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
