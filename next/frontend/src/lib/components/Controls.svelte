<script lang="ts">
  import { Undo2, ArrowLeftRight, Trash2 } from "lucide-svelte";
  import { getGameContext } from "$lib/context/game.svelte";

  const game = getGameContext();

  const visible = $derived(game.mode !== "classic");
</script>

{#if visible}
  <div class="toolbar" role="toolbar" aria-label="Powerups">
    <div class="powerup">
      <span class="badge">1</span>
      <button
        class="powerup-btn"
        disabled={!game.canUndo}
        onclick={() => game.undo()}
        aria-label="Undo, {game.powerups.undo} left"
      >
        <Undo2 size={26} />
      </button>
      <span class="count">{game.powerups.undo}</span>
    </div>

    <div class="powerup">
      <span class="badge">2</span>
      <button
        class="powerup-btn"
        class:armed={game.activeTool === "swap"}
        disabled={!game.canSwap}
        onclick={() => game.toggleTool("swap")}
        aria-label="Swap two tiles, {game.powerups.swap} left"
      >
        <ArrowLeftRight size={26} />
      </button>
      <span class="count">{game.powerups.swap}</span>
    </div>

    <div class="powerup">
      <span class="badge">3</span>
      <button
        class="powerup-btn"
        class:armed={game.activeTool === "delete"}
        disabled={!game.canDelete}
        onclick={() => game.toggleTool("delete")}
        aria-label="Delete a tile, {game.powerups.delete} left"
      >
        <Trash2 size={26} />
      </button>
      <span class="count">{game.powerups.delete}</span>
    </div>
  </div>

  {#if game.activeTool === "swap"}
    <p class="hint">Pick two tiles to swap.</p>
  {:else if game.activeTool === "delete"}
    <p class="hint">Pick a tile to delete.</p>
  {/if}
{/if}

<style>
  .toolbar {
    display: flex;
    gap: 10px;
    justify-content: center;
    background: var(--score-bg);
    padding: 12px;
    border-radius: 18px;
    max-width: 384px;
    margin: 0 auto;
  }

  .powerup {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    max-width: 64px;
  }

  .badge {
    position: absolute;
    right: 0;
    top: 0;
    transform: translate(40%, -40%);
    z-index: 2;
    background: var(--modal-bg);
    color: #fff;
    font-size: 0.7rem;
    padding: 0 6px;
    border-radius: 999px;
    pointer-events: none;
  }

  .powerup-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    width: 100%;
    border: none;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--btn-text);
    transition: background 0.05s ease, box-shadow 0.05s ease;
  }

  .powerup-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 65%, transparent);
  }

  .powerup-btn.armed {
    background: var(--accent-strong);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-strong) 40%, transparent);
  }

  .powerup-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .count {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--score-text);
  }

  .hint {
    text-align: center;
    font-size: 0.85rem;
    color: var(--muted);
    margin: 8px 0 0;
  }
</style>