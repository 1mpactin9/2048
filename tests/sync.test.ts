import { describe, it, expect, beforeEach } from "vitest";
import type { GameState, GameMode } from "../src/core/types";
import {
  load,
  save,
  saveSettings,
  writeGame,
  readGame,
  deleteGame,
  clearAllGames,
  addSnapshot,
  getSnapshots,
  deleteSnapshot,
  renameSnapshot,
  reorderSnapshots,
  loadSnapshots,
  stateSignature,
  repairSaves,
  DEFAULT_SETTINGS,
  type StoredData,
} from "../src/core/storage";

function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    memoryStorage();
});

function makeState(
  size: number,
  mode: GameMode,
  score: number,
  grid: GameState["grid"] = [],
): GameState {
  return {
    size,
    mode,
    grid,
    score,
    best: score,
    powerups: { undo: 0, swap: 0, delete: 0 },
    won: false,
    wonAcknowledged: false,
    over: false,
    history: [],
    moveCount: 0,
    deltaHistory: [],
  };
}

describe("per-game storage keys", () => {
  it("writeGame/readGame round-trip", () => {
    const s = makeState(4, "standard", 88);
    writeGame(s);
    const back = readGame("4:standard");
    expect(back?.score).toBe(88);
  });

  it("saveSettings does not clobber existing games", () => {
    writeGame(makeState(4, "standard", 50));
    const data: StoredData = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, theme: "dark" },
      games: {},
      nextId: 1,
    };
    saveSettings(data);
    expect(readGame("4:standard")?.score).toBe(50);
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.games["4:standard"]?.score).toBe(50);
  });

  it("deleteGame removes a single game", () => {
    writeGame(makeState(4, "standard", 10));
    writeGame(makeState(6, "classic", 20));
    deleteGame("4:standard");
    expect(readGame("4:standard")).toBeUndefined();
    expect(readGame("6:classic")?.score).toBe(20);
  });

  it("clearAllGames removes every game key", () => {
    writeGame(makeState(4, "standard", 10));
    writeGame(makeState(5, "standard", 20));
    clearAllGames();
    expect(readGame("4:standard")).toBeUndefined();
    expect(readGame("5:standard")).toBeUndefined();
  });
});

describe("v1 dict migration", () => {
  it("migrates legacy games dict to per-game keys", () => {
    const legacy = {
      version: 1,
      settings: DEFAULT_SETTINGS,
      games: { "4:standard": makeState(4, "standard", 123) },
      nextId: 7,
    };
    localStorage.setItem("2048:v1", JSON.stringify(legacy));
    const loaded = load();
    expect(loaded.games["4:standard"]?.score).toBe(123);
    expect(loaded.nextId).toBe(7);
    expect(readGame("4:standard")?.score).toBe(123);
    const meta = JSON.parse(localStorage.getItem("2048:v1")!);
    expect(meta.games).toBeUndefined();
  });
});

describe("corruption repair", () => {
  it("repairGame coerces NaN score and missing powerups", () => {
    writeGame({
      size: 4,
      mode: "standard",
      grid: [],
      score: NaN,
      best: NaN,
      powerups: undefined as unknown as GameState["powerups"],
      won: "yes" as unknown as boolean,
      wonAcknowledged: false,
      over: false,
      history: "oops" as unknown as GameState["history"],
      moveCount: "5" as unknown as number,
      deltaHistory: [],
    });
    const g = readGame("4:standard")!;
    expect(g.score).toBe(0);
    expect(g.best).toBe(0);
    expect(g.powerups).toEqual({ undo: 0, swap: 0, delete: 0 });
    expect(g.history).toEqual([]);
    expect(g.moveCount).toBe(0);
    expect(g.won).toBe(false);
  });

  it("repairSaves drops corrupt snapshots and games", () => {
    addSnapshot("4:standard", "w1", "good", makeState(4, "standard", 10));
    const all = loadSnapshots();
    all.push({
      id: "bad",
      gameKey: "4:standard",
      windowId: "w2",
      name: "bad",
      state: null as unknown as GameState,
      createdAt: 1,
      updatedAt: 1,
    });
    localStorage.setItem("2048:snapshots:v1", JSON.stringify(all));
    const data = load();
    const r = repairSaves(data);
    expect(r.snapshots).toBe(1);
    expect(getSnapshots("4:standard").length).toBe(1);
  });
});

describe("snapshots", () => {
  it("addSnapshot dedupes identical signatures", () => {
    const s = makeState(4, "standard", 10);
    addSnapshot("4:standard", "w1", "a", s);
    const dup = addSnapshot("4:standard", "w2", "b", s);
    expect(getSnapshots("4:standard").length).toBe(1);
    expect(dup?.name).toBe("a");
  });

  it("delete/rename/reorder", () => {
    const a = addSnapshot("4:standard", "w1", "a", makeState(4, "standard", 10))!;
    const b = addSnapshot("4:standard", "w1", "b", makeState(4, "standard", 20))!;
    const c = addSnapshot("4:standard", "w1", "c", makeState(4, "standard", 30))!;
    renameSnapshot(b.id, "renamed");
    expect(getSnapshots("4:standard").find((s) => s.id === b.id)?.name).toBe(
      "renamed",
    );
    reorderSnapshots("4:standard", [c.id, a.id, b.id]);
    const order = getSnapshots("4:standard").map((s) => s.id);
    expect(order).toEqual([c.id, a.id, b.id]);
    deleteSnapshot(a.id);
    expect(getSnapshots("4:standard").map((s) => s.id)).toEqual([c.id, b.id]);
  });

  it("snapshots are scoped per gameKey", () => {
    addSnapshot("4:standard", "w1", "a", makeState(4, "standard", 10));
    addSnapshot("6:classic", "w1", "b", makeState(6, "classic", 20));
    expect(getSnapshots("4:standard").length).toBe(1);
    expect(getSnapshots("6:classic").length).toBe(1);
  });
});

describe("stateSignature", () => {
  it("distinguishes different boards", () => {
    const s1 = makeState(4, "standard", 10, [[{ id: 1, value: 2 }]]);
    const s2 = makeState(4, "standard", 10, [[{ id: 1, value: 4 }]]);
    expect(stateSignature(s1)).not.toBe(stateSignature(s2));
    expect(stateSignature(s1)).toBe(stateSignature(s1));
  });

  it("empty/undefined signatures", () => {
    expect(stateSignature(undefined)).toBe("");
  });
});
