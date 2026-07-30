<script lang="ts">
  import { animate } from "popmotion";
  import type { RenderTile } from "$lib/types/game";
  import { tileColors, tileFontScale } from "$lib/game/colors";

  interface Props {
    tile: RenderTile;
    unit: number;
    pad: number;
    cell: number;
    selectable?: boolean;
    selected?: boolean;
    onTap?: (row: number, col: number) => void;
  }

  let {
    tile,
    unit,
    pad,
    cell,
    selectable = false,
    selected = false,
    onTap,
  }: Props = $props();

  let el = $state<HTMLButtonElement>();
  let prevRow = tile.row;
  let prevCol = tile.col;

  const colors = $derived(tileColors(tile.value));
  const fontScale = $derived(tileFontScale(tile.value));

  function x(col: number): number {
    return pad + col * unit;
  }
  function y(row: number): number {
    return pad + row * unit;
  }

  const reduceMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Slide: animate transform when the tile's grid position changes.
  $effect(() => {
    const node = el;
    if (!node) return;
    const toX = x(tile.col);
    const toY = y(tile.row);

    if (tile.row === prevRow && tile.col === prevCol) {
      node.style.transform = `translate(${toX}px, ${toY}px)`;
      return;
    }

    const fromX = x(prevCol);
    const fromY = y(prevRow);
    prevRow = tile.row;
    prevCol = tile.col;

    if (reduceMotion()) {
      node.style.transform = `translate(${toX}px, ${toY}px)`;
      return;
    }

    const controls = animate({
      from: { tx: fromX, ty: fromY },
      to: { tx: toX, ty: toY },
      type: "spring",
      stiffness: 380,
      damping: 34,
      mass: 0.9,
      onUpdate: (v: { tx: number; ty: number }) => {
        node.style.transform = `translate(${v.tx}px, ${v.ty}px)`;
      },
    });
    return () => controls.stop();
  });

  // Spawn / merge pop.
  $effect(() => {
    const node = el;
    if (!node) return;
    if (reduceMotion()) return;
    if (tile.isNew) {
      const controls = animate({
        from: 0.3,
        to: 1,
        type: "spring",
        stiffness: 460,
        damping: 26,
        onUpdate: (s: number) => {
          node.style.setProperty("--tile-scale", String(s));
        },
      });
      return () => controls.stop();
    }
    if (tile.isMerged) {
      const controls = animate({
        from: 1,
        to: 1,
        type: "keyframes",
        values: [1, 1.18, 1],
        duration: 180,
        onUpdate: (s: number) => {
          node.style.setProperty("--tile-scale", String(s));
        },
      });
      return () => controls.stop();
    }
    node.style.setProperty("--tile-scale", "1");
  });

  function handleClick() {
    if (selectable && onTap) onTap(tile.row, tile.col);
  }
</script>

<button
  bind:this={el}
  class="tile"
  class:selectable
  class:selected
  type="button"
  disabled={!selectable}
  onclick={handleClick}
  style:width="{cell}px"
  style:height="{cell}px"
  style:background={colors.bg}
  style:color={colors.fg}
  style:font-size="{cell * 0.42 * fontScale}px"
  aria-label="Tile {tile.value}"
>
  <span class="tile-value">{tile.value}</span>
</button>

<style>
  .tile {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--tile-radius);
    font-weight: 700;
    line-height: 1;
    box-shadow: var(--shadow-tile);
    will-change: transform;
    transform-origin: center;
    padding: 0;
    user-select: none;
  }

  .tile-value {
    display: block;
    transform: scale(var(--tile-scale, 1));
  }

  .tile:disabled {
    cursor: default;
  }

  .tile.selectable {
    cursor: pointer;
  }

  .tile.selectable:not(.selected) {
    outline: 2px dashed rgba(255, 255, 255, 0.6);
    outline-offset: -6px;
  }

  .tile.selected {
    outline: 3px solid var(--accent-strong);
    outline-offset: -3px;
  }
</style>
