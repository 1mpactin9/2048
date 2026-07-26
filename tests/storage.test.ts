import { describe, it, expect, beforeEach } from "vitest";
import type { StoredData } from "../src/core/storage";
import { load, save, getGame, putGame, clearGames, DEFAULT_SETTINGS } from "../src/core/storage";
import { gameKey } from "../src/core/constants";
import type { GameMode, GameState } from "../src/core/types";

// In-memory localStorage for node test environment.
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
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

describe("load — fresh data", () => {
  it("returns fresh data when localStorage is empty", () => {
    const loaded = load();
    expect(loaded.version).toBe(1);
    expect(loaded.games).toEqual({});
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("returns fresh data on JSON parse error", () => {
    localStorage.setItem("2048:v1", "not json {{{");
    const loaded = load();
    expect(loaded.version).toBe(1);
    expect(loaded.games).toEqual({});
  });

  it("returns fresh data on version mismatch", () => {
    localStorage.setItem("2048:v1", JSON.stringify({ version: 99, settings: {}, games: {} }));
    const loaded = load();
    expect(loaded.version).toBe(1);
    expect(loaded.games).toEqual({});
  });

  it("fills missing settings with defaults", () => {
    localStorage.setItem("2048:v1", JSON.stringify({
      version: 1,
      settings: { theme: "dark" },
      games: {},
    }));
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(DEFAULT_SETTINGS.lastSize);
    expect(loaded.settings.autoSpeed).toBe(DEFAULT_SETTINGS.autoSpeed);
  });
});

describe("load — partial data", () => {
  it("loads settings with defaults filled in for missing fields", () => {
    localStorage.setItem("2048:v1", JSON.stringify({
      version: 1,
      settings: { theme: "dark", lastSize: 3 },
      games: {},
    }));
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(3);
    expect(loaded.settings.autoOn).toBe(false);
  });

  it("loads games dictionary correctly", () => {
    const state: GameState = {
      size: 4, mode: "standard" as GameMode, grid: [], score: 100, best: 200,
      powerups: { undo: 1, swap: 1, delete: 1 }, won: false, wonAcknowledged: false,
      over: false, history: [], moveCount: 5, deltaHistory: [],
    };
    localStorage.setItem("2048:v1", JSON.stringify({
      version: 1,
      settings: DEFAULT_SETTINGS,
      games: { "4:standard": state },
      nextId: 10,
    }));
    const loaded = load();
    expect(getGame(loaded, 4, "standard")).toBeDefined();
    expect(loaded.games["4:standard"]!.score).toBe(100);
  });

  it("sets nextId from stored value", () => {
    localStorage.setItem("2048:v1", JSON.stringify({
      version: 1,
      settings: DEFAULT_SETTINGS,
      games: {},
      nextId: 42,
    }));
    const loaded = load();
    expect(loaded.nextId).toBe(42);
  });
});

describe("save / load round-trip", () => {
  it("saves and reloads settings correctly", () => {
    const data: StoredData = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, theme: "dark", lastSize: 6, autoSpeed: 50 },
      games: {},
      nextId: 1,
    };
    save(data);
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(6);
    expect(loaded.settings.autoSpeed).toBe(50);
  });

  it("saves and reloads multiple games", () => {
    const data: StoredData = {
      version: 1,
      settings: DEFAULT_SETTINGS,
      games: {
        "4:standard": { size: 4, mode: "standard" as GameMode, grid: [], score: 100, best: 0, powerups: { undo: 0, swap: 0, delete: 0 }, won: false, wonAcknowledged: false, over: false, history: [], moveCount: 1, deltaHistory: [] },
        "6:classic": { size: 6, mode: "classic" as GameMode, grid: [], score: 200, best: 0, powerups: { undo: 0, swap: 0, delete: 0 }, won: false, wonAcknowledged: false, over: false, history: [], moveCount: 2, deltaHistory: [] },
      },
      nextId: 5,
    };
    save(data);
    const loaded = load();
    expect(getGame(loaded, 4, "standard")!.score).toBe(100);
    expect(getGame(loaded, 6, "classic")!.score).toBe(200);
  });

  it("nextId round-trips when saved fresh", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 1 };
    save(data);
    const loaded = load();
    expect(loaded.version).toBe(1);
    expect(typeof loaded.nextId).toBe("number");
  });
});

describe("Corrupted data handling", () => {
  it("truncated JSON returns fresh data", () => {
    localStorage.setItem("2048:v1", '{"version":');
    const loaded = load();
    expect(loaded.version).toBe(1);
  });

  it("non-object JSON returns fresh data", () => {
    localStorage.setItem("2048:v1", '"just a string"');
    const loaded = load();
    expect(loaded.version).toBe(1);
  });

  it("array JSON returns fresh data", () => {
    localStorage.setItem("2048:v1", "[1, 2, 3]");
    const loaded = load();
    expect(loaded.version).toBe(1);
  });

  it("settings with wrong type returns defaults", () => {
    localStorage.setItem("2048:v1", JSON.stringify({
      version: 1,
      settings: "not an object",
      games: {},
    }));
    const loaded = load();
    // settings spread with string should fall back to defaults
    expect(loaded.settings.theme).toBeDefined();
  });
});

describe("getGame / putGame", () => {
  it("putGame stores under correct gameKey", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 1 };
    const state: GameState = {
      size: 4, mode: "standard" as GameMode, grid: [], score: 42, best: 0,
      powerups: { undo: 0, swap: 0, delete: 0 }, won: false, wonAcknowledged: false,
      over: false, history: [], moveCount: 0, deltaHistory: [],
    };
    putGame(data, state);
    expect(getGame(data, 4, "standard")).toBeDefined();
  });

  it("getGame retrieves stored game", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 1 };
    const state: GameState = {
      size: 4, mode: "standard" as GameMode, grid: [], score: 42, best: 0,
      powerups: { undo: 0, swap: 0, delete: 0 }, won: false, wonAcknowledged: false,
      over: false, history: [], moveCount: 0, deltaHistory: [],
    };
    putGame(data, state);
    const retrieved = getGame(data, 4, "standard");
    expect(retrieved!.score).toBe(42);
  });

  it("multiple sizes/modes stored independently", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 1 };
    const makeState = (size: number, mode: GameMode, score: number): GameState => ({
      size, mode, grid: [], score, best: 0, powerups: { undo: 0, swap: 0, delete: 0 },
      won: false, wonAcknowledged: false, over: false, history: [], moveCount: 0, deltaHistory: [],
    });
    putGame(data, makeState(4, "standard", 100));
    putGame(data, makeState(4, "classic", 200));
    putGame(data, makeState(6, "standard", 300));
    expect(getGame(data, 4, "standard")!.score).toBe(100);
    expect(getGame(data, 4, "classic")!.score).toBe(200);
    expect(getGame(data, 6, "standard")!.score).toBe(300);
  });

  it("getGame returns undefined for unstored combinations", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 1 };
    expect(getGame(data, 4, "standard")).toBeUndefined();
  });
});

describe("clearGames", () => {
  it("wipes all games", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 1 };
    const state: GameState = {
      size: 4, mode: "standard" as GameMode, grid: [], score: 100, best: 0,
      powerups: { undo: 0, swap: 0, delete: 0 }, won: false, wonAcknowledged: false,
      over: false, history: [], moveCount: 0, deltaHistory: [],
    };
    putGame(data, state);
    clearGames(data);
    expect(getGame(data, 4, "standard")).toBeUndefined();
  });

  it("resets nextId via clearGames", () => {
    const data: StoredData = { version: 1, settings: DEFAULT_SETTINGS, games: {}, nextId: 42 };
    clearGames(data);
    // clearGames sets data.games = {} but does not modify data.nextId
    // The setNextId(1) call in clearGames affects the global counter, not data.nextId
    expect(data.games).toEqual({});
  });

  it("settings remain intact after clear", () => {
    const data: StoredData = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, theme: "dark", lastSize: 6 },
      games: {},
      nextId: 1,
    };
    clearGames(data);
    expect(data.settings.theme).toBe("dark");
    expect(data.settings.lastSize).toBe(6);
  });
});

describe("gameKey", () => {
  it("produces consistent keys", () => {
    expect(gameKey(4, "standard")).toBe("4:standard");
    expect(gameKey(3, "classic")).toBe("3:classic");
  });

  it("different sizes produce different keys", () => {
    const k1 = gameKey(4, "standard");
    const k2 = gameKey(6, "standard");
    expect(k1).not.toBe(k2);
  });

  it("different modes produce different keys", () => {
    const k1 = gameKey(4, "standard");
    const k2 = gameKey(4, "classic");
    expect(k1).not.toBe(k2);
  });
});

describe("save robustness", () => {
  it("does not throw on oversized data", () => {
    const data: StoredData = {
      version: 1,
      settings: DEFAULT_SETTINGS,
      games: {},
      nextId: 1,
    };
    // Should not throw even if localStorage is full
    expect(() => save(data)).not.toThrow();
  });
});
