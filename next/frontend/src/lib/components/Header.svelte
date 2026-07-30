<script lang="ts">
  import { getGameContext } from "$lib/context/game.svelte";
  import { loadSettings, saveSettings } from "$lib/game/storage";
  import { applyTheme } from "$lib/context/theme";
  import { SIZES } from "$lib/game/constants";
  import type { GameMode, Theme } from "$lib/types/game";

  const game = getGameContext();

  const THEMES: Theme[] = ["system", "light", "dark"];

  let theme = $state<Theme>(loadSettings().theme ?? "system");
  let menuOpen = $state(false);

  function setTheme(t: Theme) {
    theme = t;
    applyTheme(t);
    saveSettings({ theme: t });
  }

  function setSize(s: number) {
    game.start(s, game.mode);
    menuOpen = false;
  }

  function setMode(m: GameMode) {
    game.start(game.size, m);
    menuOpen = false;
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
  }
</script>

<div class="header">
  <div class="header-row">
    <button class="menu-btn" onclick={toggleMenu} aria-label="Menu">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
      <h1 class="title">2048</h1>
    </button>

    <div class="scores">
      <div class="score-card">
        <span class="score-label">Score</span>
        <span class="score-value" aria-live="polite">{game.score}</span>
      </div>
      <div class="score-card best">
        <span class="score-label">Best</span>
        <span class="score-value">{game.best}</span>
      </div>
    </div>

    <button class="btn-primary" onclick={() => game.newGame()}>
      <span class="badge">N or R</span>
      New Game
    </button>
  </div>

  {#if menuOpen}
    <div class="menu-backdrop" role="presentation" onclick={toggleMenu} onkeydown={(e) => e.key === 'Escape' && toggleMenu()}></div>
    <div class="menu" role="dialog" aria-label="Game menu">
      <ul class="menu-list">
        <li>
          <button class="menu-item" class:active={game.mode === "standard"} onclick={() => setMode("standard")}>
            <span class="menu-item-icon">*</span>
            <span class="menu-item-text">
              <span class="menu-item-title">Standard</span>
              <span class="menu-item-desc">2048 with powerups</span>
            </span>
          </button>
        </li>
        <li>
          <button class="menu-item" class:active={game.mode === "classic"} onclick={() => setMode("classic")}>
            <span class="menu-item-icon">&#9634;</span>
            <span class="menu-item-text">
              <span class="menu-item-title">Classic</span>
              <span class="menu-item-desc">The original 2048, no undo</span>
            </span>
          </button>
        </li>
        <li>
          <button class="menu-item" class:active={game.mode === "plus"} onclick={() => setMode("plus")}>
            <span class="menu-item-icon plus-icon">+</span>
            <span class="menu-item-text">
              <span class="menu-item-title plus-text">Plus</span>
              <span class="menu-item-desc">Bonus powerups and dark board</span>
            </span>
          </button>
        </li>
      </ul>

      <hr class="menu-divider" />

      <div class="menu-section">
        <span class="menu-section-label">Board size</span>
        <div class="size-grid">
          {#each SIZES as s}
            <button
              class="size-btn"
              class:active={game.size === s}
              onclick={() => setSize(s)}
            >
              {s}&times;{s}
            </button>
          {/each}
        </div>
      </div>

      <hr class="menu-divider" />

      <div class="menu-section">
        <span class="menu-section-label">Theme</span>
        <div class="size-grid">
          {#each THEMES as t}
            <button
              class="size-btn"
              class:active={theme === t}
              onclick={() => setTheme(t)}
            >
              {t}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .header {
    position: relative;
    z-index: 50;
  }

  .header-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 12px;
    padding: 0 8px;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--menu-icon);
    transition: background 0.075s ease;
  }

  .menu-btn:hover {
    background: var(--border);
  }

  .title {
    font-size: 2.25rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-strong);
  }

  .scores {
    display: flex;
    gap: 12px;
  }

  .score-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 6px 16px;
    background: var(--score-bg);
    color: var(--score-text);
    border-radius: 14px;
    font-weight: 700;
    min-width: 80px;
  }

  .score-card.best {
    border: 2px solid var(--best-ring);
  }

  .score-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .score-value {
    font-size: 1.15rem;
  }

  .btn-primary {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(to bottom, #998c7e, #988776);
    box-shadow: 0 5px 15px rgba(140, 100, 60, 0.12), 0 2px 3px rgba(140, 100, 60, 0.09), inset 0 -1px 0 rgba(0, 0, 0, 0.1);
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    white-space: nowrap;
  }

  .badge {
    position: absolute;
    right: 0;
    top: 0;
    transform: translate(50%, -50%);
    background: var(--modal-bg);
    color: #fff;
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 999px;
    white-space: nowrap;
    pointer-events: none;
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .menu {
    position: absolute;
    top: 56px;
    left: 8px;
    right: 8px;
    z-index: 45;
    background: var(--dropdown-bg);
    border-radius: 14px;
    box-shadow: 0 4px 6px rgba(140, 100, 60, 0.13), 0 10px 30px rgba(140, 100, 60, 0.18);
    padding: 8px 0;
  }

  .menu-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--dropdown-text);
    text-align: left;
    font-size: 0.9rem;
    border-radius: 8px;
    transition: background 0.075s ease;
  }

  .menu-item:hover,
  .menu-item.active {
    background: var(--dropdown-selected);
    color: var(--dropdown-selected-text);
  }

  .menu-item-icon {
    flex-shrink: 0;
    width: 20px;
    text-align: center;
    font-size: 1.1rem;
  }

  .plus-icon {
    color: #e46543;
  }

  .plus-text {
    color: #e46543;
  }

  .menu-item-text {
    display: flex;
    flex-direction: column;
  }

  .menu-item-title {
    font-weight: 600;
  }

  .menu-item-desc {
    font-size: 0.75rem;
    opacity: 0.75;
  }

  .menu-divider {
    border: none;
    border-top: 1px solid var(--divider);
    margin: 6px 12px;
  }

  .menu-section {
    padding: 8px 12px;
  }

  .menu-section-label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--dropdown-text-secondary);
    margin-bottom: 6px;
  }

  .size-grid {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .size-btn {
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--dropdown-text);
    font-size: 0.8rem;
    font-weight: 500;
    transition: background 0.075s ease;
  }

  .size-btn:hover,
  .size-btn.active {
    background: var(--dropdown-selected);
    color: var(--dropdown-selected-text);
    border-color: var(--dropdown-selected);
  }
</style>