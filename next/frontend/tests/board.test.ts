import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import BoardHarness from "./fixtures/BoardHarness.svelte";

afterEach(cleanup);

describe("Board component", () => {
  it("renders a 4x4 board with two starting tiles", () => {
    const { container } = render(BoardHarness, { props: { size: 4 } });
    const board = container.querySelector('[role="grid"]');
    expect(board).not.toBeNull();
    const cells = container.querySelectorAll(".cell");
    expect(cells.length).toBe(16);
    const tiles = container.querySelectorAll(".tile");
    expect(tiles.length).toBe(2);
  });

  it("renders the correct cell count for a 6x6 board", () => {
    const { container } = render(BoardHarness, { props: { size: 6 } });
    expect(container.querySelectorAll(".cell").length).toBe(36);
  });

  it("labels tiles with their value", () => {
    const { container } = render(BoardHarness, { props: { size: 4 } });
    const tile = container.querySelector(".tile");
    expect(tile?.getAttribute("aria-label")).toMatch(/^Tile \d+$/);
  });
});
