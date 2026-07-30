<script lang="ts">
  import { onMount } from "svelte";
  import Tile from "./Tile.svelte";
  import { getGameContext } from "$lib/context/game.svelte";
  import { attachTouch } from "$lib/context/input";

  const game = getGameContext();

  let boardEl = $state<HTMLDivElement>();
  let boardPx = $state(492);

  const GAP = 12;
  const PAD = 12;

  const size = $derived(game.size);
  const inner = $derived(boardPx - PAD * 2);
  const unit = $derived((inner + GAP) / size);
  const cell = $derived(unit - GAP);

  const cells = $derived(
    Array.from({ length: size * size }, (_, i) => ({
      row: Math.floor(i / size),
      col: i % size,
    })),
  );

  const selectable = $derived(
    game.activeTool === "swap" || game.activeTool === "delete",
  );

  function isSelected(row: number, col: number): boolean {
    return (
      game.swapFirst !== null &&
      game.swapFirst.row === row &&
      game.swapFirst.col === col
    );
  }

  function cellPos(row: number, col: number): { x: number; y: number } {
    return { x: PAD + col * unit, y: PAD + row * unit };
  }

  onMount(() => {
    if (!boardEl) return;
    const parent = boardEl.parentElement!;
    const ro = new ResizeObserver(() => {
      const avail = Math.min(parent.clientWidth, 492);
      boardPx = Math.max(240, avail);
    });
    ro.observe(parent);
    const detach = attachTouch(boardEl, (dir) => game.move(dir));
    return () => {
      ro.disconnect();
      detach();
    };
  });
</script>

<div class="board-wrap">
  <div
    bind:this={boardEl}
    class="board"
    style:width="{boardPx}px"
    style:height="{boardPx}px"
    style:padding="{PAD}px"
    role="grid"
    aria-label="{size} by {size} game board"
  >
    {#each cells as c (c.row + ':' + c.col)}
      {@const pos = cellPos(c.row, c.col)}
      <div
        class="cell"
        style:width="{cell}px"
        style:height="{cell}px"
        style:transform="translate({pos.x}px, {pos.y}px)"
      ></div>
    {/each}

    {#each game.tiles as tile (tile.id)}
      <Tile
        {tile}
        {unit}
        pad={PAD}
        {cell}
        {selectable}
        selected={isSelected(tile.row, tile.col)}
        onTap={(r, col) => game.tapTile(r, col)}
      />
    {/each}

    {#if game.showWin}
      <div class="overlay overlay-win">
        <div class="overlay-title">You win!</div>
        <div class="overlay-actions">
          <button class="overlay-btn" onclick={() => game.keepPlaying()}>
            Keep going
          </button>
          <button class="overlay-btn" onclick={() => game.newGame()}>
            New Game
          </button>
        </div>
      </div>
    {:else if game.over}
      <div class="overlay overlay-over">
        <div class="overlay-title">Game over!</div>
        <div class="overlay-actions">
          <button class="overlay-btn" onclick={() => game.newGame()}>
            Try again
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .board-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .board {
    position: relative;
    background: var(--board-inner);
    border-radius: var(--board-radius);
    box-shadow: var(--shadow-board), var(--board-inner-shadow);
    touch-action: none;
    max-width: 100%;
  }

  .cell {
    position: absolute;
    top: 0;
    left: 0;
    background: color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: var(--tile-radius);
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    border-radius: var(--board-radius);
    background: color-mix(in srgb, var(--board-inner) 80%, transparent);
    backdrop-filter: blur(2px);
    animation: overlay-fade 0.25s ease;
    z-index: 20;
  }

  .overlay-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-strong);
  }

  .overlay-actions {
    display: flex;
    gap: 10px;
  }

  .overlay-btn {
    padding: 10px 18px;
    border: none;
    border-radius: 10px;
    background: var(--btn-bg);
    color: var(--btn-text);
    font-weight: 600;
    font-size: 0.95rem;
    transition: background 0.1s ease;
  }

  .overlay-btn:hover {
    background: var(--btn-bg-hover);
  }
</style>
