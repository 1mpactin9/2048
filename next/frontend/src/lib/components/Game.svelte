<script lang="ts">
  import Board from "$lib/components/Board.svelte";
  import Controls from "$lib/components/Controls.svelte";
  import { getGameContext } from "$lib/context/game.svelte";
  import type { GameMode } from "$lib/types/game";

  interface Props {
    mode: GameMode;
  }

  let { mode }: Props = $props();
  const game = getGameContext();

  // Switch to this route's mode (resumes a saved game for that mode if present).
  $effect(() => {
    if (game.mode !== mode) game.start(game.size, mode);
  });
</script>

<div class="game-body" class:plus={mode === "plus"}>
  <Board />
</div>
<div class="game-foot">
  <Controls />
</div>

<style>
  .game-body {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 0 8px;
  }

  /* Plus mode: darken the board area regardless of the active theme. */
  .game-body.plus :global(.board) {
    background: #2a2620;
    box-shadow: var(--shadow-board), inset 0 2px 6px rgba(0, 0, 0, 0.55);
  }

  .game-body.plus :global(.cell) {
    background: rgba(255, 255, 255, 0.06);
  }

  .game-foot {
    flex-shrink: 0;
  }
</style>