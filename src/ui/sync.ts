import type { GameState } from "../core/types";
import { tileColor } from "../core/constants";
import {
  deleteSnapshot,
  getSnapshots,
  readGame,
  renameSnapshot,
  reorderSnapshots,
  type SnapshotEntry,
} from "../core/storage";

export interface SyncOptions {
  getGameKey: () => string;
  onSelect: (state: GameState) => void;
  onConfirm: (title: string, message: string) => Promise<boolean>;
  onMultiWindowChange?: (multi: boolean) => void;
}

interface PresenceMsg {
  type: "ping" | "pong" | "leave" | "changed";
  id: string;
}

const ICON_STACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7l9 4 9-4-9-4Z"/><path d="m3 12 9 4 9-4"/><path d="m3 17 9 4 9-4"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>';
const ICON_PENCIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_GRIP =
  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export class MultiWindowSync {
  readonly windowId: string;
  private opts: SyncOptions;
  private bc: BroadcastChannel | null = null;
  private peers = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private multi = false;
  private dock: HTMLElement;
  private fab: HTMLButtonElement;
  private badge: HTMLElement;
  private panel: HTMLElement;
  private list: HTMLElement;
  private renameCard: HTMLElement;
  private renameInput: HTMLInputElement;
  private open = false;
  private dragId: string | null = null;
  private renamingId: string | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: SyncOptions) {
    this.opts = opts;
    this.windowId = makeId();

    this.dock = document.createElement("div");
    this.dock.className = "sync-dock";
    this.dock.hidden = true;

    this.fab = document.createElement("button");
    this.fab.type = "button";
    this.fab.className = "sync-dock__fab";
    this.fab.setAttribute("aria-label", "Board snapshots");
    this.fab.innerHTML = ICON_STACK;
    this.badge = document.createElement("span");
    this.badge.className = "sync-dock__badge";
    this.badge.textContent = "0";
    this.fab.append(this.badge);
    this.fab.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.supportsHover()) return;
      this.toggle();
    });

    this.panel = document.createElement("div");
    this.panel.className = "sync-dock__panel";
    const header = document.createElement("div");
    header.className = "sync-dock__header";
    const title = document.createElement("span");
    title.className = "sync-dock__title";
    title.textContent = "Snapshots";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sync-dock__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);

    this.list = document.createElement("div");
    this.list.className = "sync-dock__list";
    this.panel.append(header, this.list);

    this.renameCard = document.createElement("div");
    this.renameCard.className = "sync-rename";
    this.renameCard.hidden = true;
    const rl = document.createElement("span");
    rl.className = "sync-rename__label";
    rl.textContent = "Rename snapshot";
    this.renameInput = document.createElement("input");
    this.renameInput.className = "sync-rename__input";
    this.renameInput.type = "text";
    this.renameInput.maxLength = 40;
    const ra = document.createElement("div");
    ra.className = "sync-rename__actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn--ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.closeRename());
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "btn btn--primary";
    confirm.textContent = "Confirm";
    confirm.addEventListener("click", () => this.commitRename());
    ra.append(cancel, confirm);
    this.renameCard.append(rl, this.renameInput, ra);

    this.dock.append(this.panel, this.renameCard, this.fab);
    document.body.appendChild(this.dock);

    this.renameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.commitRename();
      else if (e.key === "Escape") this.closeRename();
    });

    document.addEventListener("click", (e) => {
      if (this.open && !this.dock.contains(e.target as Node)) this.close();
    });

    this.dock.addEventListener("mouseenter", () => {
      if (!this.supportsHover()) return;
      if (this.hoverTimer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }
      if (!this.renamingId) this.openPanel();
    });
    this.dock.addEventListener("mouseleave", () => {
      if (!this.supportsHover()) return;
      if (this.renamingId) return;
      this.hoverTimer = setTimeout(() => {
        this.close();
        this.closeRename();
      }, 150);
    });

    this.setupChannel();
    this.startHeartbeat();
    window.addEventListener("beforeunload", this.onUnload);
    window.addEventListener("storage", this.onStorage);
  }

  get isMultiWindow(): boolean {
    return this.multi;
  }

  private supportsHover(): boolean {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(hover: hover) and (pointer: fine)").matches
    );
  }

  private applyVisibility(count: number): void {
    this.dock.hidden = !(this.multi && count > 1);
  }

  private updateBadge(): void {
    const gk = this.opts.getGameKey();
    const count = getSnapshots(gk).length;
    this.badge.textContent = String(count);
    this.applyVisibility(count);
  }

  private setupChannel(): void {
    try {
      this.bc = new BroadcastChannel("2048-sync");
      this.bc.onmessage = (e: MessageEvent) => {
        this.onMessage(e.data as PresenceMsg);
      };
    } catch {
      this.bc = null;
    }
  }

  private startHeartbeat(): void {
    this.post({ type: "ping", id: this.windowId });
    this.timer = setInterval(() => {
      this.post({ type: "ping", id: this.windowId });
      this.prune();
    }, 1500);
  }

  private post(msg: PresenceMsg): void {
    try {
      this.bc?.postMessage(msg);
    } catch {}
  }

  notifyChanged(): void {
    this.post({ type: "changed", id: this.windowId });
  }

  private onMessage(msg: PresenceMsg | null): void {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ping" || msg.type === "pong") {
      this.peers.set(msg.id, Date.now());
      this.updatePresence();
      if (msg.type === "ping") this.post({ type: "pong", id: this.windowId });
    } else if (msg.type === "leave") {
      this.peers.delete(msg.id);
      this.updatePresence();
    } else if (msg.type === "changed") {
      if (this.open) this.renderList();
      else this.updateBadge();
    }
  }

  private prune(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, t] of this.peers) {
      if (now - t > 4000) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.updatePresence();
  }

  private updatePresence(): void {
    const next = this.peers.size >= 1;
    if (next !== this.multi) {
      this.multi = next;
      if (!next) {
        this.dock.hidden = true;
        this.close();
        this.closeRename();
      } else {
        this.updateBadge();
      }
      this.opts.onMultiWindowChange?.(next);
    }
  }

  refresh(): void {
    if (!this.multi) return;
    if (this.open) this.renderList();
    else this.updateBadge();
  }

  private toggle(): void {
    this.open ? this.close() : this.openPanel();
  }

  private openPanel(): void {
    this.open = true;
    this.panel.classList.add("is-open");
    this.renderList();
  }

  close(): void {
    this.open = false;
    this.panel.classList.remove("is-open");
  }

  private renderList(): void {
    const gk = this.opts.getGameKey();
    const snaps = getSnapshots(gk);
    this.badge.textContent = String(snaps.length);
    this.applyVisibility(snaps.length);
    this.list.replaceChildren();
    const live = this.makeLiveRow();
    if (live) this.list.appendChild(live);
    if (snaps.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sync-empty";
      empty.textContent = "No snapshots yet. Play in another window to create one.";
      this.list.appendChild(empty);
      return;
    }
    for (const s of snaps) this.list.appendChild(this.makeRow(s));
  }

  private makePreview(state: GameState): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "sync-row__preview";
    wrap.style.setProperty("--pn", String(state.size));
    const g = state.grid;
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const cell = document.createElement("span");
        cell.className = "sync-cell";
        const v = g[r]?.[c]?.value ?? 0;
        if (v > 0) {
          const { bg, fg } = tileColor(v);
          cell.style.setProperty("--scell-bg", bg);
          cell.style.setProperty("--scell-fg", fg);
          cell.textContent = String(v);
        }
        wrap.appendChild(cell);
      }
    }
    return wrap;
  }

  private makeLiveRow(): HTMLElement | null {
    const live = readGame(this.opts.getGameKey());
    if (!live) return null;
    const row = document.createElement("div");
    row.className = "sync-row sync-row--live";
    const body = document.createElement("button");
    body.type = "button";
    body.className = "sync-row__body";
    body.append(this.makePreview(live));
    const info = document.createElement("div");
    info.className = "sync-row__info";
    const name = document.createElement("div");
    name.className = "sync-row__name";
    name.textContent = "Current";
    const meta = document.createElement("div");
    meta.className = "sync-row__meta";
    meta.textContent = `${live.score} pts · ${live.moveCount} moves · live`;
    info.append(name, meta);
    body.append(info);
    body.addEventListener("click", () => this.opts.onSelect(live));
    row.append(body);
    return row;
  }

  private makeRow(s: SnapshotEntry): HTMLElement {
    const row = document.createElement("div");
    row.className = "sync-row";
    row.draggable = true;
    row.dataset.id = s.id;

    const grip = document.createElement("span");
    grip.className = "sync-row__grip";
    grip.innerHTML = ICON_GRIP;

    const body = document.createElement("button");
    body.type = "button";
    body.className = "sync-row__body";
    body.append(this.makePreview(s.state));
    const info = document.createElement("div");
    info.className = "sync-row__info";
    const name = document.createElement("div");
    name.className = "sync-row__name";
    name.textContent = s.name || "Snapshot";
    const meta = document.createElement("div");
    meta.className = "sync-row__meta";
    meta.textContent = `${s.state.score} pts · ${s.state.moveCount} moves · ${fmtTime(s.updatedAt)}`;
    info.append(name, meta);
    body.append(info);
    body.addEventListener("click", () => this.opts.onSelect(s.state));

    const actions = document.createElement("div");
    actions.className = "sync-row__actions";
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "sync-row__btn";
    rename.setAttribute("aria-label", "Rename");
    rename.innerHTML = ICON_PENCIL;
    rename.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openRename(s);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "sync-row__btn sync-row__btn--danger";
    del.setAttribute("aria-label", "Delete");
    del.innerHTML = ICON_TRASH;
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await this.opts.onConfirm(
        "Delete snapshot?",
        `"${s.name || "Snapshot"}" will be permanently removed.`,
      );
      if (!ok) return;
      deleteSnapshot(s.id);
      this.notifyChanged();
      this.renderList();
    });
    actions.append(rename, del);

    row.append(grip, body, actions);

    row.addEventListener("dragstart", (e) => {
      this.dragId = s.id;
      e.dataTransfer?.setData("text/plain", s.id);
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      this.dragId = null;
      row.classList.remove("is-dragging");
    });
    row.addEventListener("dragover", (e) => {
      if (!this.dragId || this.dragId === s.id) return;
      e.preventDefault();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!this.dragId || this.dragId === s.id) return;
      const gk = this.opts.getGameKey();
      const ids = getSnapshots(gk).map((x) => x.id);
      const from = ids.indexOf(this.dragId);
      const to = ids.indexOf(s.id);
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(from, 1);
      ids.splice(to, 0, this.dragId);
      reorderSnapshots(gk, ids);
      this.notifyChanged();
      this.renderList();
    });

    return row;
  }

  private openRename(s: SnapshotEntry): void {
    this.close();
    this.renamingId = s.id;
    this.renameInput.value = s.name || "Snapshot";
    this.renameCard.hidden = false;
    this.renameInput.focus();
    this.renameInput.select();
  }

  private closeRename(): void {
    this.renamingId = null;
    this.renameCard.hidden = true;
  }

  private commitRename(): void {
    if (!this.renamingId) return;
    const name = this.renameInput.value.trim() || "Snapshot";
    renameSnapshot(this.renamingId, name);
    this.notifyChanged();
    this.closeRename();
    this.renderList();
  }

  private onStorage = (e: StorageEvent): void => {
    if (e.key === "2048:snapshots:v1" || (e.key && e.key.startsWith("2048:game:"))) {
      if (this.open) this.renderList();
      else this.updateBadge();
    }
  };

  private onUnload = (): void => {
    this.post({ type: "leave", id: this.windowId });
  };

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.bc?.close();
    this.bc = null;
    window.removeEventListener("beforeunload", this.onUnload);
    window.removeEventListener("storage", this.onStorage);
    this.dock.remove();
  }
}
