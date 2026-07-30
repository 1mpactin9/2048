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

<div class="game-body">
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

  .game-foot {
    flex-shrink: 0;
  }
</style>