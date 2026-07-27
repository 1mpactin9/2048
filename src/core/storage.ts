import type { GameMode, GameState } from "./types";
import { DEFAULT_MODE, DEFAULT_SIZE, gameKey } from "./constants";
import { peekNextId, setNextId } from "./grid";

export type ThemePref = "light" | "dark" | "system";

export interface Settings {
  theme: ThemePref;
  lastSize: number;
  lastMode: GameMode;
  autoOn: boolean;
  autoSpeed: number;
  autoDepth: number;
  autoPowerups: boolean;
  rngManip: boolean;
  deterministic: boolean;
  backtrackEnabled: boolean;
}

export interface StoredData {
  version: number;
  settings: Settings;
  games: Record<string, GameState>;
  nextId: number;
}

export interface SnapshotEntry {
  id: string;
  gameKey: string;
  windowId: string;
  name: string;
  state: GameState;
  createdAt: number;
  updatedAt: number;
}

const KEY = "2048:v1";
const GAME_PREFIX = "2048:game:";
const SNAP_KEY = "2048:snapshots:v1";
const VERSION = 1;
const MAX_SNAPSHOTS = 50;
const VALID_MODES: GameMode[] = ["standard", "classic"];
const VALID_THEMES: ThemePref[] = ["light", "dark", "system"];

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  lastSize: DEFAULT_SIZE,
  lastMode: DEFAULT_MODE,
  autoOn: false,
  autoSpeed: 180,
  autoDepth: 0,
  autoPowerups: true,
  rngManip: false,
  deterministic: false,
  backtrackEnabled: true,
};

function freshData(): StoredData {
  return {
    version: VERSION,
    settings: { ...DEFAULT_SETTINGS },
    games: {},
    nextId: 0,
  };
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function coerceBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function repairSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  out.theme = VALID_THEMES.includes(s.theme as ThemePref)
    ? (s.theme as ThemePref)
    : DEFAULT_SETTINGS.theme;
  out.lastSize =
    isFiniteNum(s.lastSize) && s.lastSize > 0
      ? Math.floor(s.lastSize as number)
      : DEFAULT_SETTINGS.lastSize;
  out.lastMode = VALID_MODES.includes(s.lastMode as GameMode)
    ? (s.lastMode as GameMode)
    : DEFAULT_SETTINGS.lastMode;
  out.autoOn = coerceBool(s.autoOn, DEFAULT_SETTINGS.autoOn);
  out.autoSpeed =
    isFiniteNum(s.autoSpeed) && (s.autoSpeed as number) >= 0
      ? (s.autoSpeed as number)
      : DEFAULT_SETTINGS.autoSpeed;
  out.autoDepth =
    isFiniteNum(s.autoDepth) && (s.autoDepth as number) >= 0
      ? (s.autoDepth as number)
      : DEFAULT_SETTINGS.autoDepth;
  out.autoPowerups = coerceBool(s.autoPowerups, DEFAULT_SETTINGS.autoPowerups);
  out.rngManip = coerceBool(s.rngManip, DEFAULT_SETTINGS.rngManip);
  out.deterministic = coerceBool(
    s.deterministic,
    DEFAULT_SETTINGS.deterministic,
  );
  out.backtrackEnabled = coerceBool(
    s.backtrackEnabled,
    DEFAULT_SETTINGS.backtrackEnabled,
  );
  return out;
}

function repairGame(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  let size =
    isFiniteNum(g.size) && (g.size as number) > 0
      ? Math.floor(g.size as number)
      : 0;
  let grid = g.grid;
  if (!Array.isArray(grid)) grid = [];
  if (size <= 0) size = (grid as unknown[]).length || DEFAULT_SIZE;
  const mode = VALID_MODES.includes(g.mode as GameMode)
    ? (g.mode as GameMode)
    : DEFAULT_MODE;
  const score = isFiniteNum(g.score) ? (g.score as number) : 0;
  const best = isFiniteNum(g.best) ? (g.best as number) : score;
  const p = (g.powerups ?? {}) as Record<string, unknown>;
  const powerups = {
    undo: isFiniteNum(p.undo) ? (p.undo as number) : 0,
    swap: isFiniteNum(p.swap) ? (p.swap as number) : 0,
    delete: isFiniteNum(p.delete) ? (p.delete as number) : 0,
  };
  const history = Array.isArray(g.history) ? g.history : [];
  const deltaHistory = Array.isArray(g.deltaHistory) ? g.deltaHistory : [];
  return {
    size,
    mode,
    grid: grid as GameState["grid"],
    score,
    best,
    powerups,
    won: coerceBool(g.won, false),
    wonAcknowledged: coerceBool(g.wonAcknowledged, false),
    over: coerceBool(g.over, false),
    history: history as GameState["history"],
    moveCount: isFiniteNum(g.moveCount) ? (g.moveCount as number) : 0,
    deltaHistory: deltaHistory as GameState["deltaHistory"],
    rngSeed: Array.isArray(g.rngSeed) ? (g.rngSeed as number[]) : undefined,
    rngCalls: isFiniteNum(g.rngCalls) ? (g.rngCalls as number) : 0,
  };
}

function repairGames(raw: unknown): Record<string, GameState> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, GameState> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const repaired = repairGame(v);
    if (repaired) out[k] = repaired;
  }
  return out;
}

function repairSnapshot(raw: unknown): SnapshotEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const state = repairGame(e.state);
  if (!state) return null;
  const now = Date.now();
  const createdAt = isFiniteNum(e.createdAt) ? (e.createdAt as number) : now;
  return {
    id: typeof e.id === "string" && e.id ? e.id : makeSnapId(),
    gameKey: typeof e.gameKey === "string" ? e.gameKey : "",
    windowId: typeof e.windowId === "string" ? e.windowId : "unknown",
    name: typeof e.name === "string" ? e.name : "Snapshot",
    state,
    createdAt,
    updatedAt: isFiniteNum(e.updatedAt) ? (e.updatedAt as number) : createdAt,
  };
}

function readAllGames(): Record<string, GameState> {
  const out: Record<string, GameState> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(GAME_PREFIX)) {
        const gk = k.slice(GAME_PREFIX.length);
        const g = readGame(gk);
        if (g) out[gk] = g;
      }
    }
  } catch {}
  return out;
}

export function load(): StoredData {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let nextId = 0;
  let migratedGames: Record<string, GameState> | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.version === VERSION) {
          settings = repairSettings(parsed.settings);
          nextId = isFiniteNum(parsed.nextId) ? parsed.nextId : 0;
          if (
            parsed.games &&
            typeof parsed.games === "object" &&
            !Array.isArray(parsed.games)
          ) {
            migratedGames = repairGames(parsed.games);
            persistMeta(settings, nextId);
            for (const state of Object.values(migratedGames)) writeGame(state);
          }
        }
      }
    }
  } catch {
    return freshData();
  }
  const games = migratedGames ?? readAllGames();
  setNextId((nextId || 1) + 1);
  return { version: VERSION, settings, games, nextId: nextId || 0 };
}

function persistMeta(settings: Settings, nextId: number): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, settings, nextId }),
    );
  } catch {}
}

export function saveSettings(data: StoredData): void {
  persistMeta(data.settings, peekNextId());
}

export function bumpNextId(): void {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const settings =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      parsed.settings
        ? repairSettings(parsed.settings)
        : { ...DEFAULT_SETTINGS };
    persistMeta(settings, peekNextId());
  } catch {}
}

export function writeGame(state: GameState): void {
  try {
    localStorage.setItem(
      GAME_PREFIX + gameKey(state.size, state.mode),
      JSON.stringify(state),
    );
  } catch {}
}

export function readGame(key: string): GameState | undefined {
  try {
    const raw = localStorage.getItem(GAME_PREFIX + key);
    if (!raw) return undefined;
    return repairGame(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function deleteGame(key: string): void {
  try {
    localStorage.removeItem(GAME_PREFIX + key);
  } catch {}
}

export function clearAllGames(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(GAME_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {}
}

export function save(data: StoredData): void {
  saveSettings(data);
  for (const state of Object.values(data.games)) writeGame(state);
}

export function getGame(
  data: StoredData,
  size: number,
  mode: GameMode,
): GameState | undefined {
  return data.games[gameKey(size, mode)];
}

export function putGame(data: StoredData, state: GameState): void {
  data.games[gameKey(state.size, state.mode)] = state;
}

export function clearGames(data: StoredData): void {
  data.games = {};
  clearAllGames();
  setNextId(1);
}

export function stateSignature(state: GameState | undefined): string {
  if (!state) return "";
  const g = state.grid;
  const p = state.powerups;
  let s = `${state.size}:${state.mode}:${state.score}:${state.best}:${state.moveCount}:${p.undo}:${p.swap}:${p.delete}:`;
  for (let r = 0; r < g.length; r++) {
    const row = g[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) s += (row[c]?.value ?? 0) + ",";
  }
  return s;
}

function makeSnapId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

export function loadSnapshots(): SnapshotEntry[] {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SnapshotEntry[] = [];
    for (const e of parsed) {
      const repaired = repairSnapshot(e);
      if (repaired) out.push(repaired);
    }
    return out;
  } catch {
    return [];
  }
}

function saveSnapshotsAll(snaps: SnapshotEntry[]): void {
  try {
    localStorage.setItem(
      SNAP_KEY,
      JSON.stringify(snaps.slice(0, MAX_SNAPSHOTS)),
    );
  } catch {}
}

export function getSnapshots(gk: string): SnapshotEntry[] {
  return loadSnapshots().filter((s) => s.gameKey === gk);
}

export function addSnapshot(
  gk: string,
  windowId: string,
  name: string,
  state: GameState,
): SnapshotEntry | null {
  const all = loadSnapshots();
  const sig = stateSignature(state);
  for (const e of all) {
    if (e.gameKey === gk && stateSignature(e.state) === sig) return e;
  }
  const now = Date.now();
  const entry: SnapshotEntry = {
    id: makeSnapId(),
    gameKey: gk,
    windowId,
    name,
    state,
    createdAt: now,
    updatedAt: now,
  };
  all.unshift(entry);
  saveSnapshotsAll(all);
  return entry;
}

export function deleteSnapshot(id: string): void {
  saveSnapshotsAll(loadSnapshots().filter((s) => s.id !== id));
}

export function renameSnapshot(id: string, name: string): void {
  const all = loadSnapshots();
  const s = all.find((x) => x.id === id);
  if (s) {
    s.name = name;
    s.updatedAt = Date.now();
    saveSnapshotsAll(all);
  }
}

export function reorderSnapshots(gk: string, ids: string[]): void {
  const all = loadSnapshots();
  const order = new Map(ids.map((id, i) => [id, i] as const));
  const positions: number[] = [];
  const entries: SnapshotEntry[] = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].gameKey === gk) {
      positions.push(i);
      entries.push(all[i]);
    }
  }
  entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  for (let k = 0; k < positions.length; k++) all[positions[k]] = entries[k];
  saveSnapshotsAll(all);
}

export function repairSaves(data: StoredData): {
  games: number;
  snapshots: number;
} {
  let removedSnaps = 0;
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid: SnapshotEntry[] = [];
        for (const e of parsed) {
          const r = repairSnapshot(e);
          if (r) valid.push(r);
        }
        if (valid.length !== parsed.length) {
          removedSnaps = parsed.length - valid.length;
          saveSnapshotsAll(valid);
        }
      }
    }
  } catch {}
  const beforeGames = Object.keys(data.games).length;
  const validGames: Record<string, GameState> = {};
  for (const [k, v] of Object.entries(data.games)) {
    const r = repairGame(v);
    if (r) validGames[k] = r;
    else deleteGame(k);
  }
  data.games = validGames;
  let removedGames = beforeGames - Object.keys(validGames).length;
  if (removedGames < 0) removedGames = 0;
  saveSettings(data);
  return { games: removedGames, snapshots: removedSnaps };
}

export { setNextId };
