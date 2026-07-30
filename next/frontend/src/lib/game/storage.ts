import * as v from "valibot";
import type { GameState, Theme } from "../types/game";
import { STORAGE_KEY, gameKey } from "./constants";

const TileSchema = v.object({
  id: v.number(),
  value: v.number(),
});

const CellSchema = v.nullable(TileSchema);

const GridSchema = v.array(v.array(CellSchema));

const PowerupsSchema = v.object({
  undo: v.number(),
  swap: v.number(),
  delete: v.number(),
});

const SnapshotSchema = v.object({
  grid: GridSchema,
  score: v.number(),
  powerups: PowerupsSchema,
  won: v.boolean(),
  wonAcknowledged: v.boolean(),
  over: v.boolean(),
  moveCount: v.number(),
});

const GameStateSchema = v.object({
  size: v.number(),
  mode: v.picklist(["standard", "classic", "plus"]),
  grid: GridSchema,
  score: v.number(),
  best: v.number(),
  powerups: PowerupsSchema,
  won: v.boolean(),
  wonAcknowledged: v.boolean(),
  over: v.boolean(),
  history: v.array(SnapshotSchema),
  moveCount: v.number(),
});

const SettingsSchema = v.object({
  theme: v.optional(v.picklist(["light", "dark", "system"]), "system"),
  lastSize: v.optional(v.number(), 4),
  lastMode: v.optional(v.picklist(["standard", "classic", "plus"]), "standard"),
});

const StoredSchema = v.object({
  settings: v.optional(SettingsSchema, {}),
  games: v.optional(v.record(v.string(), GameStateSchema), {}),
});

export type Settings = v.InferOutput<typeof SettingsSchema>;
export type StoredData = v.InferOutput<typeof StoredSchema>;

function emptyStore(): StoredData {
  return { settings: { theme: "system", lastSize: 4, lastMode: "standard" }, games: {} };
}

export function load(storage: Storage = localStorage): StoredData {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    const result = v.safeParse(StoredSchema, parsed);
    if (!result.success) return emptyStore();
    return result.output;
  } catch {
    return emptyStore();
  }
}

export function save(data: StoredData, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode, quota) — ignore
  }
}

export function loadSettings(storage: Storage = localStorage): Settings {
  return load(storage).settings;
}

export function saveSettings(settings: Partial<Settings>, storage: Storage = localStorage): void {
  const data = load(storage);
  data.settings = { ...data.settings, ...settings };
  save(data, storage);
}

export function getGame(
  size: number,
  mode: string,
  storage: Storage = localStorage,
): GameState | null {
  const data = load(storage);
  return data.games[gameKey(size, mode)] ?? null;
}

export function putGame(state: GameState, storage: Storage = localStorage): void {
  const data = load(storage);
  data.games[gameKey(state.size, state.mode)] = state;
  save(data, storage);
}

export function updateTheme(theme: Theme, storage: Storage = localStorage): void {
  saveSettings({ theme }, storage);
}