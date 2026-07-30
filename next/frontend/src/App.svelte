<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "$lib/components/Header.svelte";
  import { routes } from "$lib/routes";
  import { createGameContext } from "$lib/context/game.svelte";
  import { applyTheme } from "$lib/context/theme";
  import { loadSettings } from "$lib/game/storage";

  const settings = loadSettings();
  applyTheme(settings.theme ?? "system");

  // Context is created once here so the Header and routed pages share state.
  createGameContext(settings.lastSize ?? 4, settings.lastMode ?? "standard");
</script>

<div class="shell">
  <Header />
  <main class="content">
    <Router {routes} />
  </main>
  <footer class="footer">
    <a href="#/about">About</a>
    <span>&middot;</span>
    <a href="#/learn">How to play</a>
  </footer>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    padding: 12px;
    gap: 16px;
    min-height: 0;
  }

  .content {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 16px;
    min-height: 0;
  }

  .footer {
    display: flex;
    gap: 8px;
    justify-content: center;
    font-size: 0.8rem;
    color: var(--footer-text);
    padding: 8px 0;
  }

  .footer a {
    color: inherit;
    text-decoration: none;
  }

  .footer a:hover {
    text-decoration: underline;
  }
</style>