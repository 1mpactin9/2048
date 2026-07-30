import { describe, it, expect, beforeEach } from "vitest";
import { GameSession } from "../src/lib/game/session";
import { makeRng } from "../src/lib/game/rng";
import {
  getGame,
  putGame,
  load,
  loadSettings,
  saveSettings,
} from "../src/lib/game/storage";

class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

let store: MemStorage;

beforeEach(() => {
  store = new MemStorage();
});

describe("storage", () => {
  it("returns an empty store when nothing is saved", () => {
    const data = load(store);
    expect(data.games).toEqual({});
    expect(data.settings.theme).toBe("system");
  });

  it("round-trips a saved game per size:mode key", () => {
    const s = GameSession.newGame(4, "standard", 100, makeRng("seed"));
    putGame(s.state, store);
    const loaded = getGame(4, "standard", store);
    expect(loaded).not.toBeNull();
    expect(loaded!.best).toBe(100);
    expect(getGame(5, "standard", store)).toBeNull();
  });

  it("persists and reads settings", () => {
    saveSettings({ theme: "dark", lastSize: 6 }, store);
    const settings = loadSettings(store);
    expect(settings.theme).toBe("dark");
    expect(settings.lastSize).toBe(6);
  });

  it("recovers from corrupt data", () => {
    store.setItem("2048:v1", "{not valid json");
    const data = load(store);
    expect(data.games).toEqual({});
  });

  it("rejects data that fails schema validation", () => {
    store.setItem("2048:v1", JSON.stringify({ games: { "4:standard": { bogus: true } } }));
    const data = load(store);
    expect(data.games).toEqual({});
  });
});
