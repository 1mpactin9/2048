// board helpers — creation, access, cloning, queries

import { GRID_SIZE, DIRECTION_VECTORS } from './constants';
import type { Board, Position, Tile } from './types';
import { Direction } from './types';

let nextId = 1;
export function newTileId(): number {
  return nextId++;
}

// keep id counter ahead of any loaded tiles (avoid collisions after restore)
export function bumpIdFloor(minNext: number): void {
  if (minNext > nextId) nextId = minNext;
}

export function createTile(
  value: number,
  position: Position,
  opts?: Partial<Pick<Tile, 'id' | 'previousPosition' | 'merges'>>,
): Tile {
  const tile: Tile = { id: opts?.id ?? newTileId(), value, position };
  if (opts?.previousPosition) tile.previousPosition = opts.previousPosition;
  if (opts?.merges) tile.merges = opts.merges;
  return tile;
}

export function createBoard(size = GRID_SIZE): Board {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
}

export function inBounds(board: Board, { x, y }: Position): boolean {
  return y >= 0 && y < board.length && x >= 0 && x < board[0].length;
}

export function getCell(board: Board, pos: Position): Tile | null | undefined {
  if (!inBounds(board, pos)) return undefined;
  return board[pos.y][pos.x];
}

export function setCell(board: Board, pos: Position, tile: Tile | null): void {
  board[pos.y][pos.x] = tile;
}

// deep-ish clone: rebuilds each tile object, drops previousPosition/merges
export function cloneBoardFresh(board: Board): Board {
  return board.map((row) =>
    row.map((cell) => (cell ? createTile(cell.value, cell.position, { id: cell.id }) : null)),
  );
}

export function emptyCells(board: Board): Position[] {
  const cells: Position[] = [];
  for (let y = 0; y < board.length; y++)
    for (let x = 0; x < board[y].length; x++)
      if (board[y][x] === null) cells.push({ x, y });
  return cells;
}

export function allTiles(board: Board): Tile[] {
  const tiles: Tile[] = [];
  for (const row of board) for (const cell of row) if (cell) tiles.push(cell);
  return tiles;
}

export function tileCount(board: Board): number {
  return allTiles(board).length;
}

export function hasEmptyCell(board: Board): boolean {
  return board.some((row) => row.some((c) => c === null));
}

export function addVec(a: Position, b: Position): Position {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

// walk from pos in dir; return the last empty cell reached and the blocking obstacle
export type Obstacle =
  | { type: 'boundary' }
  | { type: 'tile'; tile: Tile; position: Position };

export function slide(
  board: Board,
  pos: Position,
  dir: Direction,
): { emptyPosition: Position; obstacle: Obstacle } {
  const vec = DIRECTION_VECTORS[dir];
  let current = pos;
  let next = addVec(current, vec);
  while (inBounds(board, next) && getCell(board, next) === null) {
    current = next;
    next = addVec(current, vec);
  }
  const obstacle: Obstacle = !inBounds(board, next)
    ? { type: 'boundary' }
    : { type: 'tile', tile: getCell(board, next) as Tile, position: next };
  return { emptyPosition: current, obstacle };
}

// any two orthogonally-adjacent tiles share a value (a move is possible)
export function hasAdjacentEqual(board: Board): boolean {
  for (const dir of Object.values(Direction)) {
    for (const tile of allTiles(board)) {
      const { obstacle } = slide(board, tile.position, dir);
      if (obstacle.type === 'tile' && obstacle.tile.value === tile.value)
        return true;
    }
  }
  return false;
}

export function highestTile(board: Board): number {
  let max = 0;
  for (const tile of allTiles(board)) if (tile.value > max) max = tile.value;
  return max;
}
