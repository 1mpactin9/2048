import { describe, it, expect, beforeEach } from 'vitest';
import type { GameMode, GameState } from '../src/core/types';
import { POWERUP_QUOTA } from '../src/core/constants';
import { gridFromValues, gridToValues, hasMoves, isFull, spawnTile } from '../src/core/grid';
import { move, canMove } from '../src/core/move';
import { GameSession } from '../src/core/session';
import { load, save, putGame, getGame, clearGames, type StoredData } from '../src/core/storage';

// Deterministic RNG so spawn placement is reproducible.
function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// In-memory localStorage for the node test environment.
function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

/** Build a size×size grid with the given row placed at row 0 (rest empty). */
function row0(row: number[]): number[][] {
  const n = row.length;
  const grid: number[][] = [];
  for (let r = 0; r < n; r++) grid.push(r === 0 ? [...row] : new Array(n).fill(0));
  return grid;
}

function makeSession(values: number[][], mode: GameMode = 'standard', rng: () => number = seededRng()): GameSession {
  const grid = gridFromValues(values);
  const size = values.length;
  const powerups = mode === 'standard' ? { ...POWERUP_QUOTA } : { undo: 0, swap: 0, delete: 0 };
  const state: GameState = {
    size,
    mode,
    grid,
    score: 0,
    best: 0,
    powerups,
    won: false,
    wonAcknowledged: false,
    over: false,
    history: [],
    moveCount: 0,
  };
  return new GameSession(state, rng);
}

describe('move (slide + merge)', () => {
  it('slides tiles left and merges equal pairs', () => {
    const g = gridFromValues(row0([2, 0, 2, 0]));
    const { grid: out, transcript } = move(g, 'left');
    expect(gridToValues(out)).toEqual(row0([4, 0, 0, 0]));
    expect(transcript.moved).toBe(true);
    expect(transcript.gained).toBe(4);
  });

  it('merges at most once per tile per move', () => {
    const g = gridFromValues(row0([2, 2, 2, 0]));
    expect(gridToValues(move(g, 'left').grid)).toEqual(row0([4, 2, 0, 0]));
  });

  it('cascades merges correctly on a packed line', () => {
    const g = gridFromValues(row0([2, 2, 4, 4]));
    const { grid: out, transcript } = move(g, 'left');
    expect(gridToValues(out)).toEqual(row0([4, 8, 0, 0]));
    expect(transcript.gained).toBe(12);
  });

  it('slides right', () => {
    const g = gridFromValues(row0([2, 0, 2, 0]));
    expect(gridToValues(move(g, 'right').grid)).toEqual(row0([0, 0, 0, 4]));
  });

  it('slides up and down by column', () => {
    const g = gridFromValues([
      [2, 0],
      [2, 0],
    ]);
    expect(gridToValues(move(g, 'up').grid)).toEqual([
      [4, 0],
      [0, 0],
    ]);
    expect(gridToValues(move(g, 'down').grid)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it('reports moved=false when nothing changes', () => {
    const g = gridFromValues(row0([2, 4, 0, 0]));
    expect(move(g, 'left').transcript.moved).toBe(false);
  });

  it('canMove reflects whether a direction changes the board', () => {
    const g = gridFromValues([
      [2, 4],
      [4, 2],
    ]);
    expect(canMove(g, 'left')).toBe(false);
    expect(canMove(g, 'right')).toBe(false);
    expect(canMove(g, 'up')).toBe(false);
    expect(canMove(g, 'down')).toBe(false);
  });

  it('does not mutate the input grid', () => {
    const g = gridFromValues(row0([2, 0, 2, 0]));
    const before = gridToValues(g);
    move(g, 'left');
    expect(gridToValues(g)).toEqual(before);
  });

  it('produces a transcript with stable tile ids for survivors and merges', () => {
    const g = gridFromValues(row0([2, 0, 2, 0]));
    const { transcript } = move(g, 'left');
    const survivors = transcript.moves.filter((m) => m.newValue !== undefined);
    const absorbed = transcript.moves.filter((m) => m.mergedInto !== undefined);
    expect(survivors).toHaveLength(1);
    expect(absorbed).toHaveLength(1);
    expect(absorbed[0].mergedInto).toBe(survivors[0].id);
    expect(survivors[0].newValue).toBe(4);
  });
});

describe('grid helpers', () => {
  it('spawnTile places a tile in an empty cell', () => {
    const g = gridFromValues([
      [2, 0],
      [0, 0],
    ]);
    const t = spawnTile(g, { value: 4, at: { row: 0, col: 1 } });
    expect(t).not.toBeNull();
    expect(g[0][1]?.value).toBe(4);
  });

  it('spawnTile returns null on a full board', () => {
    const g = gridFromValues([
      [2, 4],
      [8, 16],
    ]);
    expect(spawnTile(g)).toBeNull();
  });

  it('hasMoves detects a stuck full board', () => {
    expect(hasMoves(gridFromValues([
      [2, 4],
      [8, 16],
    ]))).toBe(false);
  });

  it('hasMoves true when empties exist or equal tiles adjacent', () => {
    expect(hasMoves(gridFromValues([
      [2, 2],
      [8, 16],
    ]))).toBe(true);
    expect(isFull(gridFromValues([
      [2, 0],
      [0, 0],
    ]))).toBe(false);
  });
});

describe('GameSession moves + spawn', () => {
  it('applies a move, spawns a tile, and gains score', () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    const t = s.applyMove('left');
    expect(t).not.toBeNull();
    expect(s.state.score).toBe(4);
    // one merge result (4) + one spawned tile = 2 non-empty cells
    expect(s.state.grid.flat().filter(Boolean).length).toBe(2);
  });

  it('does not spawn on a no-op move', () => {
    const s = makeSession(row0([2, 4, 0, 0]));
    const before = s.state.grid.flat().filter(Boolean).length;
    expect(s.applyMove('left')).toBeNull();
    expect(s.state.grid.flat().filter(Boolean).length).toBe(before);
  });

  it('detects a win at 2048', () => {
    const s = makeSession(row0([1024, 1024, 0, 0]));
    s.applyMove('left');
    expect(s.state.won).toBe(true);
  });

  it('flags game over on a stuck full board', () => {
    const s = makeSession([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    s.applyMove('left');
    expect(s.state.over).toBe(true);
  });
});

describe('powerups', () => {
  it('undo reverts the last move and consumes a charge', () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove('left');
    expect(s.state.powerups.undo).toBe(2);
    expect(s.undo()).toBe(true);
    expect(s.state.powerups.undo).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual(row0([2, 0, 2, 0]));
    expect(s.state.score).toBe(0);
  });

  it('undo refuses without a charge or history', () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.undo()).toBe(false); // no history yet
    s.state.powerups.undo = 0;
    s.applyMove('left');
    expect(s.undo()).toBe(false); // no charge
  });

  it('swap exchanges two tiles and consumes a charge', () => {
    const s = makeSession([
      [2, 4],
      [0, 0],
    ]);
    expect(s.swap(0, 0, 0, 1)).toBe(true);
    expect(s.state.powerups.swap).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual([
      [4, 2],
      [0, 0],
    ]);
  });

  it('swap refuses empty cells or same cell', () => {
    const s = makeSession([
      [2, 0],
      [0, 0],
    ]);
    expect(s.swap(0, 0, 0, 1)).toBe(false);
    expect(s.swap(0, 0, 0, 0)).toBe(false);
  });

  it('delete removes a tile and consumes a charge', () => {
    const s = makeSession([
      [2, 4],
      [0, 0],
    ]);
    expect(s.deleteTile(0, 1)).toBe(true);
    expect(s.state.powerups.delete).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual([
      [2, 0],
      [0, 0],
    ]);
  });

  it('classic mode has no powerups', () => {
    const s = makeSession(row0([2, 0, 2, 0]), 'classic');
    expect(s.state.powerups).toEqual({ undo: 0, swap: 0, delete: 0 });
    expect(s.canUndo).toBe(false);
    expect(s.swap(0, 0, 0, 2)).toBe(false);
    expect(s.deleteTile(0, 0)).toBe(false);
  });
});

describe('storage', () => {
  it('round-trips a saved game and settings', () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove('left');
    const data: StoredData = {
      version: 1,
      settings: { theme: 'dark', lastSize: 4, lastMode: 'standard', autoOn: false, autoSpeed: 180 },
      games: {},
      nextId: 100,
    };
    putGame(data, s.state);
    save(data);

    const loaded = load();
    expect(loaded.settings.theme).toBe('dark');
    const restored = getGame(loaded, 4, 'standard');
    expect(restored).toBeDefined();
    expect(restored!.score).toBe(4);
    expect(restored!.grid[0][0]?.value).toBe(4);
  });

  it('clearGames wipes saved games', () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    const data: StoredData = {
      version: 1,
      settings: { theme: 'light', lastSize: 4, lastMode: 'standard', autoOn: false, autoSpeed: 180 },
      games: {},
      nextId: 1,
    };
    putGame(data, s.state);
    expect(getGame(data, 4, 'standard')).toBeDefined();
    clearGames(data);
    expect(getGame(data, 4, 'standard')).toBeUndefined();
  });

  it('returns fresh data when nothing is stored', () => {
    const loaded = load();
    expect(loaded.games).toEqual({});
    expect(loaded.settings.lastSize).toBe(4);
  });
});
