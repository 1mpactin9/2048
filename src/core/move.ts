import type { Cell, Direction, Grid, MoveTranscript, TileMove } from './types';
import { cloneGrid, gridsEqual } from './grid';

interface LineEntry {
  cell: Cell | null;
  row: number;
  col: number;
}

interface Placed {
  id: number;
  value: number;
  origRow: number;
  origCol: number;
  merged: boolean;
  newValue: number;
}

interface Coord {
  row: number;
  col: number;
}

/**
 * Slide + merge one line toward index 0 (the destination edge).
 * `entries` is ordered destination-first; `destAt(i)` maps a placed index back
 * to absolute grid coordinates. Returns the compacted values, per-tile move
 * transcripts, and score gained from merges.
 */
function slideLine(
  entries: LineEntry[],
  destAt: (i: number) => Coord,
): { result: (Cell | null)[]; moves: TileMove[]; gained: number } {
  const placed: Placed[] = [];
  const moves: TileMove[] = [];
  let gained = 0;

  for (const e of entries) {
    if (!e.cell) continue;
    const top = placed[placed.length - 1];
    if (top && top.value === e.cell.value && !top.merged) {
      // Merge the incoming tile into the one nearer the edge (top survives).
      top.merged = true;
      top.newValue = top.value * 2;
      top.value = top.newValue;
      gained += top.newValue;
      const dest = destAt(placed.length - 1);
      moves.push({
        id: e.cell.id,
        fromRow: e.row,
        fromCol: e.col,
        toRow: dest.row,
        toCol: dest.col,
        mergedInto: top.id,
      });
    } else {
      placed.push({
        id: e.cell.id,
        value: e.cell.value,
        origRow: e.row,
        origCol: e.col,
        merged: false,
        newValue: 0,
      });
    }
  }

  const result: (Cell | null)[] = new Array(entries.length).fill(null);
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const dest = destAt(i);
    result[i] = { id: p.id, value: p.value };
    moves.push({
      id: p.id,
      fromRow: p.origRow,
      fromCol: p.origCol,
      toRow: dest.row,
      toCol: dest.col,
      newValue: p.merged ? p.newValue : undefined,
    });
  }

  return { result, moves, gained };
}

function buildLines(grid: Grid, dir: Direction): { entries: LineEntry[]; destAt: (i: number) => Coord }[] {
  const n = grid.length;
  const lines: { entries: LineEntry[]; destAt: (i: number) => Coord }[] = [];

  for (let i = 0; i < n; i++) {
    if (dir === 'left' || dir === 'right') {
      const r = i;
      const entries: LineEntry[] = [];
      for (let c = 0; c < n; c++) entries.push({ cell: grid[r][c], row: r, col: c });
      if (dir === 'right') entries.reverse();
      const destAt =
        dir === 'left' ? (k: number) => ({ row: r, col: k }) : (k: number) => ({ row: r, col: n - 1 - k });
      lines.push({ entries, destAt });
    } else {
      const c = i;
      const entries: LineEntry[] = [];
      for (let r = 0; r < n; r++) entries.push({ cell: grid[r][c], row: r, col: c });
      if (dir === 'down') entries.reverse();
      const destAt =
        dir === 'up' ? (k: number) => ({ row: k, col: c }) : (k: number) => ({ row: n - 1 - k, col: c });
      lines.push({ entries, destAt });
    }
  }

  return lines;
}

/**
 * Pure move: returns the resulting grid and a transcript describing tile
 * movements. Does NOT spawn a tile or mutate the input grid. `moved` is false
 * when the move had no effect (caller should treat it as invalid).
 */
export function move(grid: Grid, dir: Direction): { grid: Grid; transcript: MoveTranscript } {
  const n = grid.length;
  const next = cloneGrid(grid);
  const moves: TileMove[] = [];
  let gained = 0;

  for (const { entries, destAt } of buildLines(grid, dir)) {
    const { result, moves: lineMoves, gained: lineGained } = slideLine(entries, destAt);
    moves.push(...lineMoves);
    gained += lineGained;
    for (let k = 0; k < n; k++) {
      const dest = destAt(k);
      next[dest.row][dest.col] = result[k];
    }
  }

  const moved = !gridsEqual(grid, next);
  return { grid: next, transcript: { moved, moves, gained, spawned: undefined } };
}

/** True if a move in this direction would change the board. */
export function canMove(grid: Grid, dir: Direction): boolean {
  return move(grid, dir).transcript.moved;
}
