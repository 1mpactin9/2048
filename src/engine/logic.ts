// move / merge / spawn / win-lose logic

import { DIRECTION_VECTORS, SPAWN_FOUR_PROBABILITY, WIN_TILE } from './constants';
import {
  addVec,
  allTiles,
  cloneBoardFresh,
  createTile,
  emptyCells,
  getCell,
  hasAdjacentEqual,
  hasEmptyCell,
  samePos,
  setCell,
  slide,
} from './grid';
import type { Rng } from './rng';
import type { Board, Change, Direction, Position, Tile } from './types';

export type MoveResult = {
  board: Board;
  score: number; // points gained this move
  changes: Change[];
  anyMoved: boolean;
};

// traversal order: farthest tiles in the travel direction move first
function traversalOrder(size: number, dir: Direction): { xs: number[]; ys: number[] } {
  const vec = DIRECTION_VECTORS[dir];
  const xs = Array.from({ length: size }, (_, i) => i);
  const ys = Array.from({ length: size }, (_, i) => i);
  if (vec.x === 1) xs.reverse();
  if (vec.y === 1) ys.reverse();
  return { xs, ys };
}

export function move(input: Board, dir: Direction): MoveResult {
  const board = cloneBoardFresh(input);
  const size = board.length;
  const { xs, ys } = traversalOrder(size, dir);
  let score = 0;
  let anyMoved = false;

  for (const x of xs) {
    for (const y of ys) {
      const from: Position = { x, y };
      const tile = getCell(board, from);
      if (!tile) continue;
      const { emptyPosition, obstacle } = slide(board, from, dir);

      // merge if obstacle is a same-value tile that hasn't merged this turn
      if (
        obstacle.type === 'tile' &&
        !tile.merges &&
        !obstacle.tile.merges &&
        obstacle.tile.value === tile.value
      ) {
        const target = obstacle.position;
        const other = obstacle.tile;
        const merged = createTile(tile.value + other.value, target, {
          merges: [
            createTile(tile.value, target, { id: tile.id, previousPosition: from }),
            createTile(other.value, target, {
              id: other.id,
              previousPosition: other.position,
            }),
          ],
        });
        setCell(board, from, null);
        setCell(board, target, merged);
        score += merged.value;
        anyMoved = true;
      } else if (!samePos(emptyPosition, from)) {
        // slide into the last empty cell
        const moved = createTile(tile.value, emptyPosition, {
          id: tile.id,
          previousPosition: from,
        });
        setCell(board, from, null);
        setCell(board, emptyPosition, moved);
        anyMoved = true;
      }
    }
  }

  return { board, score, changes: anyMoved ? buildChanges(board) : [], anyMoved };
}

// derive move/merge change events from the resulting board
function buildChanges(board: Board): Change[] {
  const changes: Change[] = [];
  for (const tile of allTiles(board)) {
    if (tile.merges) {
      changes.push({
        type: 'tileMerged',
        tileA: tile.merges[0],
        tileB: tile.merges[1],
        resultingTile: tile,
      });
    } else if (tile.previousPosition && !samePos(tile.previousPosition, tile.position)) {
      changes.push({
        type: 'tileMoved',
        tileId: tile.id,
        from: tile.previousPosition,
        to: tile.position,
      });
    }
  }
  return changes;
}

// spawn one tile into a random empty cell (90% 2 / 10% 4)
export function spawnTile(
  board: Board,
  rng: Rng,
  candidates?: Position[],
): { board: Board; change: Change | null } {
  const cells = (candidates ?? emptyCells(board)).filter(
    (c) => getCell(board, c) === null,
  );
  if (cells.length === 0) return { board, change: null };
  const pos = rng.choice(cells);
  const value = rng.float() < 1 - SPAWN_FOUR_PROBABILITY ? 2 : 4;
  const tile = createTile(value, pos);
  setCell(board, pos, tile);
  return { board, change: { type: 'tileAdded', position: pos, tileId: tile.id } };
}

export function isGameOver(board: Board): boolean {
  return !hasEmptyCell(board) && !hasAdjacentEqual(board);
}

// win fires only on the transition 1024 -> 2048
export function isWin(prevHighest: number, currHighest: number): boolean {
  return prevHighest === WIN_TILE / 2 && currHighest === WIN_TILE;
}

// strip animation fields so downstream ops start clean
export function stripAnimation(board: Board): Board {
  return board.map((row) =>
    row.map((cell) => (cell ? createTile(cell.value, cell.position, { id: cell.id }) : null)),
  );
}

export { addVec };
