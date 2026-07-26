import type { Grid, MoveTranscript } from "../core/types";
import { tileColor } from "../core/constants";

const SLIDE_MS = 120;

interface TileRec {
  el: HTMLElement;
  row: number;
  col: number;
}

export interface SelectResult {
  row: number;
  col: number;
  id: number;
}

/**
 * Renders a 2048 board to the DOM and animates moves using stable tile ids.
 * Layout is pixel-driven (ResizeObserver) so every board size looks right and
 * tiles slide via GPU-friendly transform transitions.
 */
export class BoardRenderer {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private tilesLayer: HTMLElement;
  private cells: HTMLElement[] = [];
  private tiles = new Map<number, TileRec>();
  private size = 4;
  private gap = 10;
  private cellSize = 0;
  private ro: ResizeObserver;
  private selectMode: {
    max: number;
    onSelected: (cells: SelectResult[]) => void;
    picked: SelectResult[];
  } | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "board";
    this.el.style.setProperty("--n", "4");

    this.grid = document.createElement("div");
    this.grid.className = "board__grid";

    this.tilesLayer = document.createElement("div");
    this.tilesLayer.className = "board__tiles";
    this.tilesLayer.addEventListener("click", this.onTileClick);

    this.el.append(this.grid, this.tilesLayer);
    container.append(this.el);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  setSize(n: number): void {
    this.size = n;
    this.el.style.setProperty("--n", String(n));
    this.grid.innerHTML = "";
    this.cells = [];
    for (let i = 0; i < n * n; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      this.grid.appendChild(cell);
      this.cells.push(cell);
    }
    this.clearTiles();
    this.layout();
  }

  private layout(): void {
    const w = this.el.clientWidth;
    if (w === 0) return;
    // For 8×8 boards the border feels proportionally too thick — dial it down.
    const ratio = this.size >= 8 ? 0.015 : 0.026;
    const minGap = this.size >= 8 ? 5 : 6;
    this.gap = Math.max(minGap, Math.round(w * ratio));
    const inner = w - this.gap * 2;
    this.cellSize = (inner - this.gap * (this.size - 1)) / this.size;
    this.el.style.setProperty("--gap", `${this.gap}px`);
    this.el.style.setProperty("--cell", `${this.cellSize}px`);
    for (const rec of this.tiles.values()) this.positionTile(rec);
  }

  private positionTile(rec: TileRec): void {
    const tx = rec.col * (this.cellSize + this.gap);
    const ty = rec.row * (this.cellSize + this.gap);
    rec.el.style.setProperty("--tx", `${tx}px`);
    rec.el.style.setProperty("--ty", `${ty}px`);
    rec.el.dataset.row = String(rec.row);
    rec.el.dataset.col = String(rec.col);
  }

  private faceForValue(value: number): { face: HTMLElement } {
    const face = document.createElement("div");
    face.className = "tile__face";
    const digits = Math.min(6, String(value).length);
    face.classList.add(`tile__face--d${digits}`);
    const { bg, fg } = tileColor(value);
    face.style.setProperty("--tile-bg", bg);
    face.style.setProperty("--tile-fg", fg);
    face.textContent = String(value);
    return { face };
  }

  private createTile(
    id: number,
    value: number,
    row: number,
    col: number,
    spawn: boolean,
  ): TileRec {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.id = String(id);
    const { face } = this.faceForValue(value);
    if (spawn) face.classList.add("is-spawn");
    el.appendChild(face);
    this.tilesLayer.appendChild(el);
    const rec: TileRec = { el, row, col };
    this.positionTile(rec);
    this.tiles.set(id, rec);
    if (spawn) {
      setTimeout(() => face.classList.remove("is-spawn"), 320);
    }
    return rec;
  }

  private updateFace(rec: TileRec, value: number): void {
    const face = rec.el.firstElementChild as HTMLElement;
    const digits = Math.min(6, String(value).length);
    face.className = `tile__face tile__face--d${digits}`;
    const { bg, fg } = tileColor(value);
    face.style.setProperty("--tile-bg", bg);
    face.style.setProperty("--tile-fg", fg);
    face.textContent = String(value);
  }

  clearTiles(): void {
    for (const rec of this.tiles.values()) rec.el.remove();
    this.tiles.clear();
  }

  /** Full rebuild from a grid (new game / undo / swap / delete / load). */
  fullRender(grid: Grid, spawn = false): void {
    this.clearTiles();
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell) this.createTile(cell.id, cell.value, r, c, spawn);
      }
    }
    this.layout();
  }

  /** Animate a move transcript (slides + merges + spawn). */
  animateMove(transcript: MoveTranscript): void {
    const removeIds = new Set<number>();
    const survivorUpdates: { id: number; value: number }[] = [];

    for (const m of transcript.moves) {
      const rec = this.tiles.get(m.id);
      if (!rec) continue;
      rec.row = m.toRow;
      rec.col = m.toCol;
      this.positionTile(rec); // triggers the slide transition
      if (m.mergedInto !== undefined) {
        removeIds.add(m.id);
      } else if (m.newValue !== undefined) {
        survivorUpdates.push({ id: m.id, value: m.newValue });
      }
    }

    if (transcript.spawned) {
      const s = transcript.spawned;
      this.createTile(s.id, s.value, s.row, s.col, true);
    }

    window.setTimeout(() => {
      for (const { id, value } of survivorUpdates) {
        const rec = this.tiles.get(id);
        if (!rec) continue;
        this.updateFace(rec, value);
        const face = rec.el.firstElementChild as HTMLElement;
        face.classList.add("is-merge");
        window.setTimeout(() => face.classList.remove("is-merge"), 220);
      }
      for (const id of removeIds) {
        const rec = this.tiles.get(id);
        if (rec) {
          rec.el.remove();
          this.tiles.delete(id);
        }
      }
    }, SLIDE_MS);
  }

  /** Animate two tiles trading places (swap powerup). Both slide simultaneously. */
  animateSwap(idA: number, idB: number): void {
    const a = this.tiles.get(idA);
    const b = this.tiles.get(idB);
    if (!a || !b) return;
    const row = a.row;
    const col = a.col;
    a.row = b.row;
    a.col = b.col;
    b.row = row;
    b.col = col;
    this.positionTile(a);
    this.positionTile(b);
  }

  // ---------- Select mode (swap / delete) ----------
  enterSelectMode(
    max: number,
    onSelected: (cells: SelectResult[]) => void,
  ): void {
    this.exitSelectMode();
    this.selectMode = { max, onSelected, picked: [] };
    this.el.classList.add("is-selecting");
    for (const rec of this.tiles.values())
      rec.el.classList.add("is-targetable");
  }

  exitSelectMode(): void {
    if (!this.selectMode) return;
    this.selectMode = null;
    this.el.classList.remove("is-selecting");
    for (const rec of this.tiles.values()) {
      rec.el.classList.remove("is-targetable", "is-selected");
    }
  }

  get isSelecting(): boolean {
    return this.selectMode !== null;
  }

  private onTileClick = (e: MouseEvent): void => {
    if (!this.selectMode) return;
    const tileEl = (e.target as HTMLElement).closest(
      ".tile",
    ) as HTMLElement | null;
    if (!tileEl) return;
    const row = Number(tileEl.dataset.row);
    const col = Number(tileEl.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    const sm = this.selectMode;
    const existing = sm.picked.findIndex((p) => p.row === row && p.col === col);
    if (existing >= 0) {
      sm.picked.splice(existing, 1);
      tileEl.classList.remove("is-selected");
      return;
    }
    sm.picked.push({ row, col, id: Number(tileEl.dataset.id) });
    tileEl.classList.add("is-selected");
    if (sm.picked.length >= sm.max) {
      const result = [...sm.picked];
      this.exitSelectMode();
      sm.onSelected(result);
    }
  };

  destroy(): void {
    this.ro.disconnect();
  }
}
