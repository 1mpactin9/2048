<script lang="ts">
  import { link } from "svelte-spa-router";

  const steps = [
    {
      title: "Swipe to move",
      body: "Use the arrow keys, WASD, or IJKL — or swipe on touch. Every tile slides as far as it can in that direction.",
    },
    {
      title: "Merge matching tiles",
      body: "When two tiles with the same number touch, they merge into one worth double. Each merge adds to your score.",
    },
    {
      title: "Reach 2048",
      body: "Keep merging to build bigger tiles. Make a 2048 tile to win — then keep going for an even higher score.",
    },
    {
      title: "Use powerups",
      body: "In Standard and Plus modes, spend Undo (1), Swap (2), and Delete (3) to recover from tight spots.",
    },
  ];
</script>

<article class="doc">
  <h2>How to play</h2>
  <ol class="steps">
    {#each steps as step, i}
      <li>
        <span class="step-num">{i + 1}</span>
        <div>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </div>
      </li>
    {/each}
  </ol>
  <a class="cta" href="/" use:link>Start playing</a>
</article>

<style>
  .doc {
    max-width: 560px;
    margin: 0 auto;
    padding: 16px;
  }

  h2 {
    font-size: 1.75rem;
    color: var(--text-strong);
  }

  .steps {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .steps li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .step-num {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 0.9rem;
  }

  h3 {
    margin: 0 0 4px;
    font-size: 1.05rem;
    color: var(--text-strong);
  }

  p {
    margin: 0;
    color: var(--text);
    line-height: 1.5;
  }

  .cta {
    display: inline-block;
    margin-top: 24px;
    padding: 10px 20px;
    border-radius: 10px;
    background: var(--btn-bg);
    color: var(--btn-text);
    font-weight: 600;
    text-decoration: none;
  }

  .cta:hover {
    background: var(--btn-bg-hover);
  }
</style>