import { describe, it, expect, beforeEach } from "vitest";
import type { GameMode, GameState } from "../src/core/types";
import type { StoredData } from "../src/core/storage";
import {
  load,
  save,
  getGame,
  putGame,
  clearGames,
  DEFAULT_SETTINGS,
} from "../src/core/storage";
import { gameKey } from "../src/core/constants";

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

function makeState(size = 4, mode: GameMode = "standard"): GameState {
  return {
    size,
    mode,
    grid: [],
    score: 0,
    best: 0,
    powerups: { undo: 0, swap: 0, delete: 0 },
    won: false,
    wonAcknowledged: false,
    over: false,
    history: [],
    moveCount: 0,
    deltaHistory: [],
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    memoryStorage();
});

describe("load — fresh data", () => {
  it("returns defaults when localStorage is empty", () => {
    const loaded = load();
    expect(loaded.version).toBe(1);
    expect(loaded.games).toEqual({});
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults on parse error, version mismatch, or wrong shape", () => {
    localStorage.setItem("2048:v1", "not json {{{");
    expect(load().version).toBe(1);
    localStorage.setItem("2048:v1", "[]");
    expect(load().games).toEqual({});
    localStorage.setItem(
      "2048:v1",
      JSON.stringify({ version: 99, settings: {}, games: {} }),
    );
    expect(load().version).toBe(1);
  });

  it("fills missing settings with defaults", () => {
    localStorage.setItem(
      "2048:v1",
      JSON.stringify({ version: 1, settings: { theme: "dark" }, games: {} }),
    );
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(DEFAULT_SETTINGS.lastSize);
  });
});

describe("save / load round-trip", () => {
  it("saves and reloads settings and multiple games", () => {
    const data: StoredData = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, theme: "dark", lastSize: 6 },
      games: {
        "4:standard": { ...makeState(4, "standard"), score: 100 },
        "6:classic": { ...makeState(6, "classic"), score: 200 },
      },
      nextId: 5,
    };
    save(data);
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(6);
    expect(getGame(loaded, 4, "standard")!.score).toBe(100);
    expect(getGame(loaded, 6, "classic")!.score).toBe(200);
  });
});

describe("getGame / putGame / clearGames", () => {
  it("stores and retrieves games under the correct key", () => {
    const data: StoredData = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      games: {},
      nextId: 1,
    };
    putGame(data, { ...makeState(), score: 42 });
    expect(getGame(data, 4, "standard")!.score).toBe(42);
    expect(getGame(data, 4, "classic")).toBeUndefined();
  });

  it("clearGames wipes all games", () => {
    const data: StoredData = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      games: { "4:standard": makeState() },
      nextId: 42,
    };
    clearGames(data);
    expect(data.games).toEqual({});
    expect(data.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});

describe("gameKey", () => {
  it("produces consistent size:mode keys", () => {
    expect(gameKey(4, "standard")).toBe("4:standard");
    expect(gameKey(3, "classic")).toBe("3:classic");
    expect(gameKey(4, "standard")).not.toBe(gameKey(4, "classic"));
    expect(gameKey(4, "standard")).not.toBe(gameKey(6, "standard"));
  });
});
