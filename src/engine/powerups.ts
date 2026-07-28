// powerup handlers — each with available / activate / complete

import {
  allTiles,
  cloneBoardFresh,
  createTile,
  emptyCells,
  getCell,
  setCell,
  tileCount,
} from './grid';
import { spawnTile } from './logic';
import { restoreRng } from './rng';
import {
  GameState,
  Powerup,
  RotationDirection,
} from './types';
import type { Board, Change, Gameplay, Position, Selection } from './types';

// re-export a board stripper (defined in grid) for local convenience
function clone(board: Board): Board {
  return cloneBoardFresh(board);
}

export type ActivateResult =
  | { kind: 'activatedAndCompleted'; gameplay: Gameplay }
  | { kind: 'activated'; selection: Selection }
  | { kind: 'unavailable' };

export type CompleteResult = {
  board: Board;
  changes: Change[];
  scoreDelta?: number;
};

export type PowerupHandler = {
  available: (g: Gameplay) => boolean;
  // undo completes instantly; others begin a selection
  activate: (g: Gameplay) => ActivateResult;
  complete?: (g: Gameplay, selection: Selection) => CompleteResult | null;
};

// --- helpers ---

function selectionFor(powerup: Powerup): Selection {
  switch (powerup) {
    case Powerup.TeleportTileToEmptyCell:
      return { powerup, kind: 'tileAndEmptyCell', tile: null, emptyCell: null };
    case Powerup.RotateOuterRingOfBoard:
      return { powerup, kind: 'rotation', direction: null };
    case Powerup.SwapTwoTiles:
      return { powerup, kind: 'multipleTile', tiles: [] };
    case Powerup.MergeAnyTwoAdjacentTiles:
      return { powerup, kind: 'adjacentTilesDirectional', origin: null, target: null };
    case Powerup.RemoveTilesByValue:
      return { powerup, kind: 'byValue', value: null };
    case Powerup.Bomb:
      return { powerup, kind: 'bomb', position: null };
    default:
      return { powerup, kind: 'bomb', position: null };
  }
}

function outerRingCells(size: number): Position[] {
  const cells: Position[] = [];
  for (let x = 0; x < size; x++) cells.push({ x, y: 0 }, { x, y: size - 1 });
  for (let y = 1; y < size - 1; y++) cells.push({ x: 0, y }, { x: size - 1, y });
  return cells;
}

// --- Undo (instant) ---

const undo: PowerupHandler = {
  available: (g) =>
    (g.state === GameState.Playing || g.state === GameState.GameOver) &&
    g.previousGameplay !== null &&
    (g.previousGameplay.state === GameState.Fresh ||
      g.previousGameplay.state === GameState.Playing),
  activate: (g) => {
    if (!g.previousGameplay) return { kind: 'unavailable' };
    const prev = g.previousGameplay;
    const restored: Gameplay = {
      ...prev,
      // rebuild rng so future spawns continue deterministically
      rng: prev.rng,
      changes: buildUndoChanges(g.changes),
      lastAction: 'undo',
    };
    return { kind: 'activatedAndCompleted', gameplay: restored };
  },
};

// invert the change list for reverse animation
function buildUndoChanges(changes: Change[]): Change[] {
  const inverted: Change[] = [];
  for (const c of changes) {
    switch (c.type) {
      case 'tileMoved':
        inverted.push({ type: 'tileMoved', tileId: c.tileId, from: c.to, to: c.from });
        break;
      case 'tileAdded':
        inverted.push({ type: 'tileRemoved', tileId: c.tileId, position: c.position });
        break;
      case 'tileMerged':
        // resulting tile splits back into its two sources
        inverted.push({
          type: 'tileMoved',
          tileId: c.tileA.id,
          from: c.resultingTile.position,
          to: c.tileA.previousPosition ?? c.tileA.position,
        });
        break;
      default:
        break;
    }
  }
  return inverted;
}

// --- Teleport: pick tile, then empty cell ---

const teleport: PowerupHandler = {
  available: (g) =>
    g.state === GameState.Playing && tileCount(g.board) > 1 && emptyCells(g.board).length > 0,
  activate: () => ({ kind: 'activated', selection: selectionFor(Powerup.TeleportTileToEmptyCell) }),
  complete: (g, sel) => {
    if (!sel.tile || !sel.emptyCell) return null;
    const board = clone(g.board);
    const moved = createTile(sel.tile.value, sel.emptyCell, {
      id: sel.tile.id,
      previousPosition: sel.tile.position,
    });
    setCell(board, sel.tile.position, null);
    setCell(board, sel.emptyCell, moved);
    return {
      board,
      changes: [
        { type: 'tileMoved', tileId: sel.tile.id, from: sel.tile.position, to: sel.emptyCell },
      ],
    };
  },
};

// --- Rotate outer ring 90 deg ---

function rotateRing(board: Board, direction: RotationDirection): {
  board: Board;
  changes: Change[];
} {
  const size = board.length;
  const src = clone(board);
  const out = clone(board);
  const s = size - 1;
  const cw = direction === RotationDirection.Clockwise;
  const moved: { tileId: number; position: Position }[] = [];

  for (let l = 0; l < s; l++) {
    const top: Position = { x: l, y: 0 };
    const right: Position = { x: s, y: l };
    const bottom: Position = { x: s - l, y: s };
    const left: Position = { x: 0, y: s - l };
    // clockwise: top->right->bottom->left->top
    const chain = cw ? [top, right, bottom, left] : [top, left, bottom, right];
    for (let i = 0; i < 4; i++) {
      const fromPos = chain[i];
      const toPos = chain[(i + 1) % 4];
      const tile = getCell(src, fromPos);
      if (tile) {
        const placed = createTile(tile.value, toPos, {
          id: tile.id,
          previousPosition: fromPos,
        });
        setCell(out, toPos, placed);
        moved.push({ tileId: tile.id, position: toPos });
      } else {
        setCell(out, toPos, null);
      }
    }
  }
  return { board: out, changes: [{ type: 'outerRingRotated', direction, tiles: moved }] };
}

const rotate: PowerupHandler = {
  available: (g) =>
    g.state === GameState.Playing &&
    tileCount(g.board) > 1 &&
    outerRingCells(g.board.length).some((p) => getCell(g.board, p)),
  activate: () => ({ kind: 'activated', selection: selectionFor(Powerup.RotateOuterRingOfBoard) }),
  complete: (g, sel) => {
    if (!sel.direction) return null;
    return rotateRing(g.board, sel.direction);
  },
};

// --- Swap two tiles ---

const swap: PowerupHandler = {
  available: (g) => g.state === GameState.Playing && tileCount(g.board) > 2,
  activate: () => ({ kind: 'activated', selection: selectionFor(Powerup.SwapTwoTiles) }),
  complete: (g, sel) => {
    const [a, b] = sel.tiles ?? [];
    if (!a || !b) return null;
    const board = clone(g.board);
    const tileA = createTile(a.value, b.position, { id: a.id, previousPosition: a.position });
    const tileB = createTile(b.value, a.position, { id: b.id, previousPosition: b.position });
    setCell(board, b.position, tileA);
    setCell(board, a.position, tileB);
    return {
      board,
      changes: [
        {
          type: 'twoTilesSwapped',
          tileA: { tileId: a.id, position: b.position },
          tileB: { tileId: b.id, position: a.position },
        },
      ],
    };
  },
};

// --- Merge two adjacent tiles ---

const mergeAdjacent: PowerupHandler = {
  available: (g) => {
    if (g.state !== GameState.Playing) return false;
    for (const t of allTiles(g.board)) {
      if (getCell(g.board, { x: t.position.x + 1, y: t.position.y }))
        return true;
      if (getCell(g.board, { x: t.position.x, y: t.position.y + 1 }))
        return true;
    }
    return false;
  },
  activate: () => ({
    kind: 'activated',
    selection: selectionFor(Powerup.MergeAnyTwoAdjacentTiles),
  }),
  complete: (g, sel) => {
    if (!sel.origin || !sel.target) return null;
    const board = clone(g.board);
    const value =
      sel.origin.value === sel.target.value
        ? sel.origin.value * 2
        : Math.max(sel.origin.value, sel.target.value);
    const result = createTile(value, sel.target.position, {
      merges: [
        createTile(sel.origin.value, sel.target.position, {
          id: sel.origin.id,
          previousPosition: sel.origin.position,
        }),
        createTile(sel.target.value, sel.target.position, {
          id: sel.target.id,
          previousPosition: sel.target.position,
        }),
      ],
    });
    setCell(board, sel.origin.position, null);
    setCell(board, sel.target.position, result);
    return {
      board,
      changes: [
        {
          type: 'tileMerged',
          tileA: result.merges![0],
          tileB: result.merges![1],
          resultingTile: result,
        },
      ],
    };
  },
};

// --- Remove all tiles of a value ---

const removeByValue: PowerupHandler = {
  available: (g) => {
    if (g.state !== GameState.Playing) return false;
    const values = new Set(allTiles(g.board).map((t) => t.value));
    return values.size > 1;
  },
  activate: () => ({ kind: 'activated', selection: selectionFor(Powerup.RemoveTilesByValue) }),
  complete: (g, sel) => {
    if (sel.value == null) return null;
    const board = clone(g.board);
    const changes: Change[] = [];
    for (const t of allTiles(board)) {
      if (t.value === sel.value) {
        setCell(board, t.position, null);
        changes.push({ type: 'tileRemoved', tileId: t.id, position: t.position });
      }
    }
    return { board, changes };
  },
};

// --- Bomb: clear 3x3, refill to keep >= 2 tiles ---

const bomb: PowerupHandler = {
  available: (g) => g.state === GameState.Playing && tileCount(g.board) > 2,
  activate: () => ({ kind: 'activated', selection: selectionFor(Powerup.Bomb) }),
  complete: (g, sel) => {
    if (!sel.position) return null;
    const board = clone(g.board);
    const center = sel.position;
    const changes: Change[] = [];
    const outside: Position[] = [];
    for (const t of allTiles(board)) {
      if (Math.abs(t.position.x - center.x) <= 1 && Math.abs(t.position.y - center.y) <= 1) {
        setCell(board, t.position, null);
        changes.push({ type: 'tileRemoved', tileId: t.id, position: t.position });
      }
    }
    // candidate refill cells = empty cells outside the blast
    for (const c of emptyCells(board)) {
      if (Math.abs(c.x - center.x) > 1 || Math.abs(c.y - center.y) > 1) outside.push(c);
    }
    const rng = restoreRng(g.rng);
    const refill = Math.max(2 - tileCount(board), 0);
    for (let i = 0; i < refill; i++) {
      const res = spawnTile(board, rng, outside);
      if (res.change) changes.push(res.change);
    }
    return { board, changes };
  },
};

export const POWERUP_HANDLERS: Record<Powerup, PowerupHandler> = {
  [Powerup.Undo]: undo,
  [Powerup.TeleportTileToEmptyCell]: teleport,
  [Powerup.RotateOuterRingOfBoard]: rotate,
  [Powerup.SwapTwoTiles]: swap,
  [Powerup.MergeAnyTwoAdjacentTiles]: mergeAdjacent,
  [Powerup.RemoveTilesByValue]: removeByValue,
  [Powerup.Bomb]: bomb,
};

// is a selection fully specified (ready to complete)?
export function isSelectionComplete(sel: Selection): boolean {
  switch (sel.kind) {
    case 'tileAndEmptyCell':
      return !!sel.tile && !!sel.emptyCell;
    case 'rotation':
      return !!sel.direction;
    case 'multipleTile':
      return (sel.tiles?.length ?? 0) >= 2;
    case 'adjacentTilesDirectional':
      return !!sel.origin && !!sel.target;
    case 'byValue':
      return sel.value != null;
    case 'bomb':
      return !!sel.position;
  }
}
