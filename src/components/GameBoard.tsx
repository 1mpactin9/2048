// board frame — cell grid background + absolutely-positioned tiles

import { forwardRef } from 'preact/compat';
import { GRID_SIZE } from '../engine/constants';
import { CELL_PCT, GAP_PCT, PAD_PCT, cellOffsetPct } from '../engine/layout';
import { allTiles } from '../engine/grid';
import { BoardTheme } from '../engine/types';
import type { Board as BoardT, Position, Tile as TileT } from '../engine/types';
import { Tile } from './Tile';

type Props = {
  board: BoardT;
  theme?: BoardTheme;
  lastAction?: string | null;
  // powerup selection helpers
  selectableTiles?: (tile: TileT) => boolean;
  selectedTileIds?: number[];
  onTileClick?: (tile: TileT) => void;
  selectableCell?: (pos: Position) => boolean;
  onCellClick?: (pos: Position) => void;
};

export const GameBoard = forwardRef<HTMLDivElement, Props>(function GameBoard(
  {
    board,
    theme = BoardTheme.Light,
    lastAction,
    selectableTiles,
    selectedTileIds,
    onTileClick,
    selectableCell,
    onCellClick,
  },
  ref,
) {
  const dark = theme === BoardTheme.Dark;
  const cells = [];
  for (let y = 0; y < GRID_SIZE; y++)
    for (let x = 0; x < GRID_SIZE; x++) {
      const clickable = selectableCell?.({ x, y }) && board[y][x] === null;
      cells.push(
        <div
          key={`c-${x}-${y}`}
          class={`absolute rounded-[12%] ${dark ? 'bg-[#6B665B]' : 'bg-leather'} ${
            clickable ? 'cursor-pointer ring-2 ring-64-red' : ''
          }`}
          style={{
            left: `${cellOffsetPct(x)}%`,
            top: `${cellOffsetPct(y)}%`,
            width: `${CELL_PCT}%`,
            height: `${CELL_PCT}%`,
          }}
          onClick={clickable && onCellClick ? () => onCellClick({ x, y }) : undefined}
        />,
      );
    }

  // spawned/merged tiles animate from scale 0
  const spawned = lastAction === 'move' || lastAction?.startsWith('complete');

  return (
    <div
      ref={ref}
      data-touch-input
      class={`relative aspect-square w-full max-w-[480px] rounded-[3%] shadow-xl ${
        dark
          ? 'bg-[linear-gradient(180deg,#54514A,#504C44)]'
          : 'bg-[linear-gradient(180deg,#998C7E,#988776)]'
      }`}
      style={{ containerType: 'size', padding: `${PAD_PCT}%`, gap: `${GAP_PCT}%` }}
    >
      {cells}
      {allTiles(board).map((tile) => (
        <Tile
          key={tile.id}
          tile={tile}
          isNew={spawned && !tile.previousPosition && !tile.merges}
          isMerged={!!tile.merges}
          selectable={selectableTiles?.(tile)}
          selected={selectedTileIds?.includes(tile.id)}
          onClick={selectableTiles?.(tile) ? onTileClick : undefined}
        />
      ))}
    </div>
  );
});