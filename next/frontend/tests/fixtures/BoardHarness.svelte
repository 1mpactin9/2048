<script lang="ts">
  import Board from "$lib/components/Board.svelte";
  import { createGameContext } from "$lib/context/game.svelte";
  import type { GameMode } from "$lib/types/game";

  interface Props {
    size?: number;
    mode?: GameMode;
  }

  let { size = 4, mode = "standard" }: Props = $props();
  // svelte-ignore state_referenced_locally
  createGameContext(size, mode);
</script>

<Board />
