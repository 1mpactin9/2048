import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import BoardHarness from "./fixtures/BoardHarness.svelte";
import { load } from "../src/lib/game/storage";

beforeEach(() => {
  localStorage.clear();
});

describe("integration", () => {
  it("persists a game after moves", async () => {
    render(BoardHarness, { props: { size: 4, mode: "standard" } });
    await tick();
    await new Promise((r) => setTimeout(r, 400));
    const data = load();
    expect(data.games["4:standard"]).toBeDefined();
    expect(data.settings.lastSize).toBe(4);
    cleanup();
  });
});
