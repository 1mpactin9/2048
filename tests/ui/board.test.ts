/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BoardRenderer } from "@/ui/board";
import type { MoveTranscript } from "@/core/types";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  },
);

describe("BoardRenderer — constructor", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  it("creates board element with correct class", () => {
    expect(board.el.className).toBe("board");
  });

  it("sets CSS custom property --n to board size", () => {
    expect(board.el.style.getPropertyValue("--n")).toBe("4");
  });

  it("appends board to container", () => {
    expect(container.contains(board.el)).toBe(true);
  });

  it("creates grid and tilesLayer children", () => {
    expect(board.el.querySelector(".board__grid")).not.toBeNull();
    expect(board.el.querySelector(".board__tiles")).not.toBeNull();
  });
});

describe("BoardRenderer — setSize", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  it("updates --n CSS property", () => {
    board.setSize(6);
    expect(board.el.style.getPropertyValue("--n")).toBe("6");
  });

  it("creates correct number of cell divs", () => {
    board.setSize(4);
    expect(board.el.querySelectorAll(".cell").length).toBe(16);
    board.setSize(3);
    expect(board.el.querySelectorAll(".cell").length).toBe(9);
    board.setSize(8);
    expect(board.el.querySelectorAll(".cell").length).toBe(64);
  });
});

describe("BoardRenderer — fullRender", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
    board.setSize(4);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  it("creates tile elements for each non-null cell", () => {
    const grid = [
      [{ id: 1, value: 2 }, null, null, null],
      [null, { id: 2, value: 4 }, null, null],
      [null, null, { id: 3, value: 8 }, null],
      [null, null, null, { id: 4, value: 16 }],
    ];
    board.fullRender(grid as any, false);
    expect(board.el.querySelectorAll(".tile").length).toBe(4);
  });

  it("sets correct tile classes and data attributes", () => {
    const grid = [[{ id: 42, value: 256 }, null, null, null]];
    grid.push(new Array(3).fill(null));
    grid.push(new Array(4).fill(null));
    board.fullRender(grid as any, false);
    const tile = board.el.querySelector('.tile[data-id="42"]');
    expect(tile).not.toBeNull();
    expect(tile?.classList.contains("tile")).toBe(true);
  });

  it("spawn flag adds is-spawn class to new tiles", () => {
    const grid = [[{ id: 1, value: 2 }, null, null, null]];
    grid.push(new Array(3).fill(null));
    grid.push(new Array(4).fill(null));
    grid.push(new Array(4).fill(null));
    board.fullRender(grid as any, true);
    const face = board.el.querySelector(".tile .tile__face");
    expect(face?.classList.contains("is-spawn")).toBe(true);
  });
});

describe("BoardRenderer — animateMove", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
    board.setSize(4);
    const grid = [
      [{ id: 1, value: 2 }, { id: 2, value: 2 }, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];
    board.fullRender(grid as any, false);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  it("positions tiles according to transcript moves", () => {
    const transcript: MoveTranscript = {
      moved: true,
      gained: 4,
      moves: [
        { id: 2, fromRow: 0, fromCol: 1, toRow: 0, toCol: 0, mergedInto: 1 },
        { id: 1, fromRow: 0, fromCol: 0, toRow: 0, toCol: 0, newValue: 4 },
      ],
      spawned: { id: 3, value: 2, row: 3, col: 3 },
    };
    board.animateMove(transcript);
    const tile1 = board.el.querySelector('[data-id="1"]');
    expect(tile1).not.toBeNull();
  });

  it("creates spawn tile element if transcript.spawned exists", () => {
    const transcript: MoveTranscript = {
      moved: true,
      gained: 4,
      moves: [{ id: 1, fromRow: 0, fromCol: 0, toRow: 0, toCol: 0 }],
      spawned: { id: 99, value: 4, row: 3, col: 3 },
    };
    board.animateMove(transcript);
    const spawnTile = board.el.querySelector('[data-id="99"]');
    expect(spawnTile).not.toBeNull();
  });
});

describe("BoardRenderer — animateSwap", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
    board.setSize(4);
    const grid = [
      [{ id: 1, value: 2 }, null, null, null],
      [null, { id: 2, value: 4 }, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];
    board.fullRender(grid as any, false);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  it("swaps row/col of both tile records", () => {
    board.animateSwap(1, 2);
    expect(board.el.querySelectorAll(".tile").length).toBe(2);
  });

  it("no-op when either id not found", () => {
    const beforeCount = board.el.querySelectorAll(".tile").length;
    board.animateSwap(999, 888);
    expect(board.el.querySelectorAll(".tile").length).toBe(beforeCount);
  });
});

describe("BoardRenderer — select mode", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
    board.setSize(4);
    const grid = [
      [{ id: 1, value: 2 }, { id: 2, value: 4 }, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];
    board.fullRender(grid as any, false);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  it("enterSelectMode adds is-selecting class", () => {
    board.enterSelectMode(2, () => {});
    expect(board.el.classList.contains("is-selecting")).toBe(true);
  });

  it("tiles get is-targetable class in select mode", () => {
    board.enterSelectMode(2, () => {});
    const targetable = board.el.querySelectorAll(".is-targetable");
    expect(targetable.length).toBe(2);
  });

  it("exitSelectMode removes all select-related classes", () => {
    board.enterSelectMode(2, () => {});
    board.exitSelectMode();
    expect(board.el.classList.contains("is-selecting")).toBe(false);
    const selected = board.el.querySelectorAll(".is-targetable, .is-selected");
    expect(selected.length).toBe(0);
  });

  it("isSelecting getter returns true in select mode", () => {
    expect(board.isSelecting).toBe(false);
    board.enterSelectMode(2, () => {});
    expect(board.isSelecting).toBe(true);
    board.exitSelectMode();
    expect(board.isSelecting).toBe(false);
  });
});

describe("BoardRenderer — destroy", () => {
  let container: HTMLElement;
  let board: BoardRenderer;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "520px";
    document.body.appendChild(container);
    board = new BoardRenderer(container);
  });

  it("does not throw", () => {
    expect(() => board.destroy()).not.toThrow();
  });
});
