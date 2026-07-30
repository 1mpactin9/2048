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
  // Track the previous grid position to animate from; mutated inside $effect.
  // svelte-ignore state_referenced_locally
  let prevRow = tile.row;
  // svelte-ignore state_referenced_locally
  let prevCol = tile.col;

  const colors = $derived(tileColors(tile.value));
  const fontScale = $derived(tileFontScale(tile.value));

  function tx(col: number): number {
    return pad + col * unit;
  }
  function ty(row: number): number {
    return pad + row * unit;
  }

  function reducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Combined position + scale effect. We write both transforms at once to avoid
  // one overriding the other.
  $effect(() => {
    const node = el;
    if (!node) return undefined;
    const toX = tx(tile.col);
    const toY = ty(tile.row);

    if (tile.row === prevRow && tile.col === prevCol) {
      node.style.transform = `translate(${toX}px, ${toY}px) scale(var(--ts,1))`;
      return undefined;
    }

    const fromX = tx(prevCol);
    const fromY = ty(prevRow);
    prevRow = tile.row;
    prevCol = tile.col;

    if (reducedMotion()) {
      node.style.transform = `translate(${toX}px, ${toY}px) scale(var(--ts,1))`;
      return undefined;
    }

    const controls = animate({
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      type: "spring",
      stiffness: 380,
      damping: 34,
      mass: 0.9,
      onUpdate: (v: { x: number; y: number }) => {
        node.style.transform = `translate(${v.x}px, ${v.y}px) scale(var(--ts,1))`;
      },
    });
    return () => controls.stop();
  });

  // Scale pop for spawn or merge.
  $effect(() => {
    const node = el;
    if (!node) return undefined;
    if (reducedMotion()) return undefined;

    if (tile.isNew) {
      const controls = animate({
        from: 0.3,
        to: 1,
        type: "spring",
        stiffness: 460,
        damping: 26,
        onUpdate: (s: number) => {
          node.style.setProperty("--ts", String(s));
        },
      });
      return () => controls.stop();
    }

    if (tile.isMerged) {
      node.style.setProperty("--ts", "1.18");
      const controls = animate({
        from: 1.18,
        to: 1,
        type: "spring",
        stiffness: 600,
        damping: 22,
        onUpdate: (s: number) => {
          node.style.setProperty("--ts", String(s));
        },
      });
      return () => controls.stop();
    }

    node.style.setProperty("--ts", "1");
    return undefined;
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
  {tile.value}
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