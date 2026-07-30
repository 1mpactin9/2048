import { getContext, setContext } from "svelte";
import { debounce } from "throttle-debounce";
import type {
  Direction,
  GameMode,
  GameState,
  MoveTranscript,
  Powerups,
  RenderTile,
  Theme,
} from "../types/game";
import { DEFAULT_MODE, DEFAULT_SIZE, WIN_VALUE } from "../game/constants";
import { GameSession, restoreSession } from "../game/session";
import { createSeed, makeRng } from "../game/rng";
import { getGame, putGame, saveSettings } from "../game/storage";
import { applyTheme } from "./theme";

const KEY = Symbol("game");

export type PowerupTool = "none" | "swap" | "delete";

function renderTiles(
  state: GameState,
  transcript: MoveTranscript | null,
): RenderTile[] {
  const spawnedId = transcript?.spawned?.id ?? -1;
  const mergedValues = new Set(
    (transcript?.moves ?? [])
      .filter((m) => m.newValue !== undefined)
      .map((m) => m.id),
  );
  const tiles: RenderTile[] = [];
  for (let r = 0; r < state.grid.length; r++) {
    for (let c = 0; c < state.grid[r].length; c++) {
      const cell = state.grid[r][c];
      if (!cell) continue;
      tiles.push({
        id: cell.id,
        value: cell.value,
        row: r,
        col: c,
        isNew: cell.id === spawnedId,
        isMerged: mergedValues.has(cell.id),
      });
    }
  }
  return tiles;
}

export class GameContext {
  private session = $state<GameSession>()!;
  private seed = "";

  tiles = $state<RenderTile[]>([]);
  score = $state(0);
  best = $state(0);
  powerups = $state<Powerups>({ undo: 0, swap: 0, delete: 0 });
  size = $state<number>(DEFAULT_SIZE);
  mode = $state<GameMode>(DEFAULT_MODE);
  won = $state(false);
  wonAcknowledged = $state(false);
  over = $state(false);
  moveCount = $state(0);
  lastTranscript = $state<MoveTranscript | null>(null);
  activeTool = $state<PowerupTool>("none");
  swapFirst = $state<{ row: number; col: number } | null>(null);

  canUndo = $derived(this.session.canUndo);
  canSwap = $derived(this.session.canSwap);
  canDelete = $derived(this.session.canDelete);
  showWin = $derived(this.won && !this.wonAcknowledged);

  private persist = debounce(300, () => {
    putGame($state.snapshot(this.session.state) as GameState);
  });

  constructor(size: number, mode: GameMode) {
    this.start(size, mode, false);
  }

  private sync(transcript: MoveTranscript | null): void {
    const s = this.session.state;
    this.tiles = renderTiles(s, transcript);
    this.score = s.score;
    this.best = s.best;
    this.powerups = { ...s.powerups };
    this.size = s.size;
    this.mode = s.mode;
    this.won = s.won;
    this.wonAcknowledged = s.wonAcknowledged;
    this.over = s.over;
    this.moveCount = s.moveCount;
    this.lastTranscript = transcript;
    this.persist();
  }

  start(size: number, mode: GameMode, allowResume = true): void {
    this.activeTool = "none";
    this.swapFirst = null;
    const best = this.readBest(size, mode);

    if (allowResume) {
      const saved = getGame(size, mode);
      if (saved && saved.grid.length === size && !saved.over) {
        this.seed = createSeed();
        this.session = restoreSession(saved, makeRng(this.seed));
        this.sync(null);
        saveSettings({ lastSize: size, lastMode: mode });
        return;
      }
    }

    this.seed = createSeed();
    this.session = GameSession.newGame(size, mode, best, makeRng(this.seed));
    this.sync(null);
    saveSettings({ lastSize: size, lastMode: mode });
    saveSettings({ lastSize: size, lastMode: mode });
  }

  private readBest(size: number, mode: GameMode): number {
    const saved = getGame(size, mode);
    return saved?.best ?? 0;
  }

  newGame(): void {
    this.start(this.size, this.mode, false);
  }

  move(dir: Direction): boolean {
    if (this.activeTool !== "none") return false;
    const transcript = this.session.applyMove(dir);
    if (!transcript) return false;
    this.sync(transcript);
    return true;
  }

  undo(): void {
    if (this.session.undo()) this.sync(null);
  }

  toggleTool(tool: PowerupTool): void {
    if (tool === "swap" && !this.canSwap) return;
    if (tool === "delete" && !this.canDelete) return;
    this.activeTool = this.activeTool === tool ? "none" : tool;
    this.swapFirst = null;
  }

  tapTile(row: number, col: number): void {
    if (this.activeTool === "delete") {
      if (this.session.deleteTile(row, col)) {
        this.activeTool = "none";
        this.sync(null);
      }
      return;
    }
    if (this.activeTool === "swap") {
      if (!this.swapFirst) {
        this.swapFirst = { row, col };
        return;
      }
      const first = this.swapFirst;
      if (this.session.swap(first.row, first.col, row, col)) {
        this.activeTool = "none";
        this.swapFirst = null;
        this.sync(null);
      } else {
        this.swapFirst = { row, col };
      }
    }
  }

  acknowledgeWin(): void {
    this.session.acknowledgeWin();
    this.sync(null);
  }

  keepPlaying(): void {
    this.acknowledgeWin();
  }

  get winValue(): number {
    return WIN_VALUE;
  }
}

export function createGameContext(size: number, mode: GameMode): GameContext {
  const ctx = new GameContext(size, mode);
  setContext(KEY, ctx);
  return ctx;
}

export function getGameContext(): GameContext {
  return getContext<GameContext>(KEY);
}

export type { Theme };
export { applyTheme };