// single animated tile — Motion spring for position/scale/opacity

import { motion } from 'motion/react';
import { TILE_SPRING, tileFontSize, tileStyle } from '../engine/constants';
import { BOARD_EDGE, CELL_PCT, cellOffsetPct } from '../engine/layout';
import type { Tile as TileT } from '../engine/types';

type Props = {
  tile: TileT;
  // spawned this frame (pop-in from scale 0)
  isNew?: boolean;
  isMerged?: boolean;
  onClick?: (tile: TileT) => void;
  selectable?: boolean;
  selected?: boolean;
};

export function Tile({ tile, isNew, isMerged, onClick, selectable, selected }: Props) {
  const style = tileStyle(tile.value);
  const from = tile.previousPosition ?? tile.position;
  const fontSize = tileFontSize(tile.value);

  return (
    <motion.div
      class='absolute flex items-center justify-center rounded-[12%] font-medium select-none'
      style={{
        width: `${CELL_PCT}%`,
        height: `${CELL_PCT}%`,
        background: style.background,
        color: style.color,
        boxShadow: style.glow,
        // font sized as a fraction of board width (container query unit)
        fontSize: `${(fontSize / BOARD_EDGE) * 100}cqw`,
        cursor: selectable ? 'pointer' : undefined,
        zIndex: isMerged ? 20 : 10,
        outline: selected ? '4px solid #e46543' : undefined,
      }}
      initial={{
        left: `${cellOffsetPct(from.x)}%`,
        top: `${cellOffsetPct(from.y)}%`,
        scale: isNew || isMerged ? 0 : 1,
      }}
      animate={{
        left: `${cellOffsetPct(tile.position.x)}%`,
        top: `${cellOffsetPct(tile.position.y)}%`,
        scale: 1,
      }}
      transition={TILE_SPRING}
      onClick={onClick ? () => onClick(tile) : undefined}
    >
      {tile.value}
    </motion.div>
  );
}