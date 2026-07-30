<script lang="ts">
  import { link } from "svelte-spa-router";

  const modes = [
    { name: "Standard", path: "/", desc: "The full game with Undo, Swap, and Delete powerups." },
    { name: "Classic", path: "/classic", desc: "The original 2048 — no powerups, no undo." },
    { name: "Plus", path: "/plus", desc: "Extra powerup charges and a dark board." },
  ];
</script>

<article class="doc">
  <h2>About</h2>
  <p>
    This is a from-scratch build of the 2048 sliding-tile puzzle. Combine
    matching numbered tiles to reach 2048 — and beyond. It is built with
    Svelte 5, Vite, and Tailwind, and supports light and dark themes.
  </p>

  <h3>Game modes</h3>
  <ul class="modes">
    {#each modes as m}
      <li>
        <a href={m.path} use:link><strong>{m.name}</strong></a>
        <span>{m.desc}</span>
      </li>
    {/each}
  </ul>

  <h3>Board sizes</h3>
  <p>Play on 3&times;3, 4&times;4, 5&times;5, 6&times;6, or 8&times;8 boards. Pick a size from the menu.</p>

  <h3>Controls</h3>
  <ul class="controls">
    <li>Move: Arrow keys, WASD, IJKL, or swipe</li>
    <li>New game: N or R</li>
    <li>Undo: 1 &nbsp;&middot;&nbsp; Swap: 2 &nbsp;&middot;&nbsp; Delete: 3</li>
  </ul>
</article>

<style>
  .doc {
    max-width: 560px;
    margin: 0 auto;
    padding: 16px;
    line-height: 1.55;
  }

  h2 {
    font-size: 1.75rem;
    color: var(--text-strong);
  }

  h3 {
    margin-top: 24px;
    color: var(--text-strong);
  }

  p {
    color: var(--text);
  }

  .modes,
  .controls {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .modes li {
    display: flex;
    flex-direction: column;
  }

  .modes a {
    color: var(--accent-strong);
    text-decoration: none;
  }

  .modes span {
    font-size: 0.9rem;
    color: var(--muted);
  }

  .controls li {
    color: var(--text);
  }
</style>