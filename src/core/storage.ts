import type { GameMode, GameState } from './types';
import { DEFAULT_MODE, DEFAULT_SIZE, gameKey } from './constants';
import { peekNextId, setNextId } from './grid';

export type ThemePref = 'light' | 'dark' | 'system';

export interface Settings {
  theme: ThemePref;
  lastSize: number;
  lastMode: GameMode;
  autoOn: boolean;
  autoSpeed: number; // ms between auto moves
  /** AI search depth override (0 = engine's adaptive default per board size). */
  autoDepth: number;
  /** Whether auto-play may spend swap/delete charges to avoid game over. */
  autoPowerups: boolean;
}

export interface StoredData {
  version: number;
  settings: Settings;
  games: Record<string, GameState>;
  nextId: number;
}

const KEY = '2048:v1';
const VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lastSize: DEFAULT_SIZE,
  lastMode: DEFAULT_MODE,
  autoOn: false,
  autoSpeed: 180,
  autoDepth: 0,
  autoPowerups: true,
};

export function load(): StoredData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshData();
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    if (parsed.version !== VERSION) return freshData();
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    const games = parsed.games ?? {};
    setNextId((parsed.nextId ?? 1) + 1);
    return { version: VERSION, settings, games, nextId: parsed.nextId ?? 1 };
  } catch {
    return freshData();
  }
}

function freshData(): StoredData {
  return { version: VERSION, settings: { ...DEFAULT_SETTINGS }, games: {}, nextId: 0 };
}

export function save(data: StoredData): void {
  try {
    const payload: StoredData = {
      version: VERSION,
      settings: data.settings,
      games: data.games,
      nextId: peekNextId(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable (private mode) - fail silently; the game
    // still plays, it just won't persist.
  }
}

export function getGame(data: StoredData, size: number, mode: GameMode): GameState | undefined {
  return data.games[gameKey(size, mode)];
}

export function putGame(data: StoredData, state: GameState): void {
  data.games[gameKey(state.size, state.mode)] = state;
}

export function clearGames(data: StoredData): void {
  data.games = {};
  setNextId(1);
}

export { setNextId };
