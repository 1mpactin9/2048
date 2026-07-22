import type { Direction, GameMode, GameState } from '../core/types';
import { DEFAULT_MODE, DEFAULT_SIZE } from '../core/constants';
import {
  type StoredData,
  clearGames,
  getGame,
  load,
  putGame,
  save,
} from '../core/storage';
import { GameSession, restoreSession } from '../core/session';
import { PlaceholderEngine } from '../core/engine';
import { BoardRenderer } from './board';
import { Input } from './input';
import { SettingsPopover } from './controls';
import { Icons } from './icons';
import {
  currentResolved,
  initTheme,
  setThemePref,
  toggleTheme,
} from './theme';

type Armed = 'none' | 'swap' | 'delete';

function modeOrder(m: GameMode): number {
  return m === 'standard' ? 0 : 1;
}

interface OverlayAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export class App {
  private data: StoredData;
  private session!: GameSession;
  private board!: BoardRenderer;
  private input!: Input;
  private popover!: SettingsPopover;

  private size: number;
  private mode: GameMode;
  private pendingNew = false;
  private armed: Armed = 'none';
  private autoOn = false;
  private lastScore = 0;
  private lastBest = 0;
  private lastSize: number;
  private lastMode: GameMode;
  private lastBadgeMode: string | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private currentOverlay: HTMLElement | null = null;

  // DOM refs
  private scoreVal!: HTMLElement;
  private bestVal!: HTMLElement;
  private powerupsRow!: HTMLElement;
  private undoBtn!: HTMLElement;
  private swapBtn!: HTMLElement;
  private deleteBtn!: HTMLElement;
  private hintEl!: HTMLElement;
  private newGameBtn!: HTMLElement;
  private themeBtn!: HTMLElement;
  private modeBadge!: HTMLElement;

  constructor() {
    this.data = load();
    this.size = this.data.settings.lastSize || DEFAULT_SIZE;
    this.mode = this.data.settings.lastMode || DEFAULT_MODE;
    this.lastSize = this.size;
    this.lastMode = this.mode;
  }

  start(): void {
    initTheme(this.data.settings.theme);
    this.buildDOM();
    this.loadGame(this.size, this.mode);
    if (this.data.settings.autoOn) this.startAuto();
  }

  // ---------- DOM ----------
  private buildDOM(): void {
    const app = document.getElementById('app')!;

    const topbar = document.createElement('header');
    topbar.className = 'topbar';

    const left = document.createElement('div');
    left.className = 'topbar__left';

    this.popover = new SettingsPopover({
      theme: this.data.settings.theme,
      autoOn: this.data.settings.autoOn,
      mode: this.mode,
      size: this.size,
      onTheme: (p) => this.onThemePref(p),
      onAuto: (on) => this.toggleAuto(on),
      onMode: (m) => this.switchTo(this.size, m),
      onSize: (s) => this.switchTo(s, this.mode),
      onClearAll: () => this.confirmClearAll(),
    });

    const logoBlock = document.createElement('div');
    logoBlock.className = 'logo-block';
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = '2048';
    const modeBadge = document.createElement('div');
    modeBadge.className = 'mode-badge';
    modeBadge.textContent = this.mode;
    logoBlock.append(logo, modeBadge);
    this.modeBadge = modeBadge;

    left.append(this.popover.el, logoBlock);

    const actions = document.createElement('div');
    actions.className = 'topbar__actions';

    const scores = document.createElement('div');
    scores.className = 'scores';
    const scoreBox = this.makeScoreBox('Score');
    const bestBox = this.makeScoreBox('Best');
    this.scoreVal = scoreBox.value;
    this.bestVal = bestBox.value;
    scores.append(scoreBox.box, bestBox.box);

    const themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'icon-btn icon-btn--theme';
    themeBtn.setAttribute('aria-label', 'Toggle theme');
    themeBtn.innerHTML = currentResolved() === 'dark' ? Icons.sun : Icons.moon;
    themeBtn.addEventListener('click', () => this.onThemeToggle());

    const newGameBtn = document.createElement('button');
    newGameBtn.type = 'button';
    newGameBtn.className = 'btn btn--primary topbar__primary';
    newGameBtn.textContent = 'New Game';
    newGameBtn.addEventListener('click', () => {
      if (this.pendingNew) this.resumeGame();
      else this.confirmNewGame();
    });

    actions.append(scores, themeBtn, newGameBtn);
    topbar.append(left, actions);

    const shell = document.createElement('main');
    shell.className = 'app';

    // stage: board + hint + powerups
    const stage = document.createElement('div');
    stage.className = 'stage';
    this.board = new BoardRenderer(stage);

    const hintEl = document.createElement('div');
    hintEl.className = 'hint';
    hintEl.style.display = 'none';
    const hintText = document.createElement('span');
    hintText.className = 'hint__text';
    const hintCancel = document.createElement('button');
    hintCancel.type = 'button';
    hintCancel.className = 'hint__cancel';
    hintCancel.textContent = 'cancel';
    hintCancel.addEventListener('click', () => this.cancelPowerup());
    hintEl.append(hintText, hintCancel);
    this.hintEl = hintEl;

    const powerups = document.createElement('div');
    powerups.className = 'powerups';
    this.undoBtn = this.makePowerupBtn(Icons.undo, 'Undo', 'undo');
    this.swapBtn = this.makePowerupBtn(Icons.swap, 'Swap', 'swap');
    this.deleteBtn = this.makePowerupBtn(Icons.delete, 'Delete', 'delete');
    powerups.append(this.undoBtn, this.swapBtn, this.deleteBtn);
    this.powerupsRow = powerups;

    stage.append(hintEl, powerups);

    shell.append(stage);
    app.append(topbar, shell);

    this.newGameBtn = newGameBtn;
    this.themeBtn = themeBtn;

    this.input = new Input(this.board.el, {
      onMove: (d) => this.doMove(d),
      onShortcut: (k) => {
        if (k === 'undo') this.powerupUndo();
        else if (k === 'delete') this.powerupDelete();
      },
    });
  }

  private makeScoreBox(label: string): { box: HTMLElement; value: HTMLElement } {
    const box = document.createElement('div');
    box.className = 'score-box' + (label === 'Best' ? ' score-box--best' : '');
    const lab = document.createElement('div');
    lab.className = 'score-box__label';
    lab.textContent = label;
    const val = document.createElement('div');
    val.className = 'score-box__value';
    val.textContent = '0';
    box.append(lab, val);
    return { box, value: val };
  }

  private makePowerupBtn(icon: string, label: string, kind: 'undo' | 'swap' | 'delete'): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'powerup-btn';
    btn.setAttribute('aria-label', label);
    const iconSpan = document.createElement('span');
    iconSpan.className = 'powerup-btn__icon';
    iconSpan.innerHTML = icon;
    const tooltip = document.createElement('span');
    tooltip.className = 'powerup-btn__tooltip';
    tooltip.textContent = label;
    const count = document.createElement('span');
    count.className = 'powerup-btn__count';
    count.textContent = '0';
    btn.append(iconSpan, count, tooltip);
    btn.addEventListener('click', () => {
      if (kind === 'undo') this.powerupUndo();
      else if (kind === 'swap') this.powerupSwap();
      else this.powerupDelete();
    });
    btn.dataset.kind = kind;
    return btn;
  }

  // ---------- Game loading ----------
  private loadGame(size: number, mode: GameMode): void {
    this.size = size;
    this.mode = mode;
    const saved = getGame(this.data, size, mode);
    let state: GameState;
    if (saved) {
      state = saved;
      this.session = restoreSession(state);
    } else {
      this.session = GameSession.newGame(size, mode, 0);
      putGame(this.data, this.session.state);
      this.persist();
    }
    this.pendingNew = false;
    this.board.setSize(size);
    this.board.fullRender(this.session.state.grid, !saved);
    this.updateUI();
    this.handleWinOver();
  }

  private switchTo(size: number, mode: GameMode): void {
    if (size === this.size && mode === this.mode) return;
    this.saveCurrent();
    this.closeOverlay();
    this.cancelPowerup();
    this.data.settings.lastSize = size;
    this.data.settings.lastMode = mode;
    this.persist();
    this.loadGame(size, mode);
    this.popover.update({ size, mode });
  }

  // ---------- Moves ----------
  private doMove(dir: Direction): void {
    if (this.board.isSelecting) return;
    if (this.session.state.over) return;
    const transcript = this.session.applyMove(dir);
    if (!transcript) return;
    this.board.animateMove(transcript);
    this.bumpScore();
    if (this.pendingNew) this.pendingNew = false;
    this.saveCurrent();
    this.updateUI();
    this.handleWinOver();
  }

  // ---------- New / Resume ----------
  private confirmNewGame(): void {
    const s = this.session.state;
    const inProgress = !s.over && s.moveCount > 0 && !this.pendingNew;
    if (inProgress) {
      this.showOverlay({
        title: 'Start a new game?',
        message: 'Your current game will be replaced.',
        actions: [
          { label: 'Cancel', onClick: () => this.closeOverlay() },
          { label: 'New Game', primary: true, onClick: () => this.newGame() },
        ],
      });
    } else {
      this.newGame();
    }
  }

  private newGame(): void {
    this.closeOverlay();
    this.cancelPowerup();
    const prevOver = this.session.state.over;
    const best = this.session.state.best;
    this.session = GameSession.newGame(this.size, this.mode, best);
    // Safety net: if the previous game was still in progress, don't overwrite
    // the saved game until the first move - so Resume can bring it back.
    this.pendingNew = !prevOver;
    if (!this.pendingNew) this.saveCurrent();
    this.board.fullRender(this.session.state.grid, true);
    this.updateUI();
  }

  private resumeGame(): void {
    if (!this.pendingNew) return;
    const saved = getGame(this.data, this.size, this.mode);
    if (!saved || saved.over || saved.moveCount === 0) {
      this.pendingNew = false;
      this.updatePrimaryButton();
      return;
    }
    this.session = restoreSession(saved);
    this.pendingNew = false;
    this.board.fullRender(this.session.state.grid);
    this.updateUI();
  }

  // ---------- Powerups ----------
  private powerupUndo(): void {
    if (!this.session.canUndo) return;
    this.clearPendingNew();
    this.session.undo();
    this.saveCurrent();
    this.board.fullRender(this.session.state.grid);
    this.updateUI();
    this.handleWinOver();
  }

  private powerupSwap(): void {
    if (!this.session.canSwap || this.board.isSelecting) {
      if (this.board.isSelecting) this.cancelPowerup();
      return;
    }
    this.stopAuto();
    this.clearPendingNew();
    this.armed = 'swap';
    this.board.enterSelectMode(2, (cells) => {
      if (cells.length === 2) {
        this.session.swap(cells[0].row, cells[0].col, cells[1].row, cells[1].col);
        this.saveCurrent();
        this.board.animateSwap(cells[0].id, cells[1].id);
      }
      this.armed = 'none';
      this.updateUI();
    });
    this.updateUI();
  }

  private powerupDelete(): void {
    if (!this.session.canDelete || this.board.isSelecting) {
      if (this.board.isSelecting) this.cancelPowerup();
      return;
    }
    this.stopAuto();
    this.clearPendingNew();
    this.armed = 'delete';
    this.board.enterSelectMode(1, (cells) => {
      if (cells.length === 1) {
        this.session.deleteTile(cells[0].row, cells[0].col);
        this.saveCurrent();
        this.board.fullRender(this.session.state.grid);
      }
      this.armed = 'none';
      this.updateUI();
    });
    this.updateUI();
  }

  private cancelPowerup(): void {
    if (this.armed === 'none' && !this.board.isSelecting) return;
    this.board.exitSelectMode();
    this.armed = 'none';
    this.updateUI();
  }

  // ---------- UI sync ----------
  private updateUI(): void {
    const s = this.session.state;

    // Detect a mode / size switch so the odometer always rolls, and rolls in
    // the direction that matches the navigation (forward/backward).
    const switched = this.lastSize !== this.size || this.lastMode !== this.mode;
    let dir: 'down' | 'up' = 'down';
    if (switched) {
      dir =
        this.size !== this.lastSize
          ? this.size > this.lastSize
            ? 'down'
            : 'up'
          : modeOrder(this.mode) > modeOrder(this.lastMode)
            ? 'down'
            : 'up';
    }
    const anim = switched ? { force: true, dir } : undefined;
    this.setScore(this.scoreVal, s.score, this.lastScore, anim);
    this.setScore(this.bestVal, s.best, this.lastBest, anim);
    this.lastScore = s.score;
    this.lastBest = s.best;
    this.lastSize = this.size;
    this.lastMode = this.mode;

    // Mode badge — animate the label on change, skip on initial load.
    if (this.lastBadgeMode !== this.mode) {
      if (this.lastBadgeMode === null) this.modeBadge.textContent = this.mode;
      else this.animateModeBadge(this.mode);
      this.lastBadgeMode = this.mode;
    }

    this.updatePrimaryButton();

    const isStandard = this.mode === 'standard';
    this.powerupsRow.style.display = isStandard ? '' : 'none';

    const setPower = (btn: HTMLElement, count: number, enabled: boolean) => {
      btn.querySelector('.powerup-btn__count')!.textContent = String(count);
      (btn as HTMLButtonElement).disabled = !enabled;
    };
    setPower(this.undoBtn, s.powerups.undo, this.session.canUndo);
    setPower(this.swapBtn, s.powerups.swap, this.session.canSwap);
    setPower(this.deleteBtn, s.powerups.delete, this.session.canDelete);

    this.swapBtn.classList.toggle('is-armed', this.armed === 'swap');
    this.deleteBtn.classList.toggle('is-armed', this.armed === 'delete');

    if (this.armed === 'none') {
      this.hintEl.style.display = 'none';
    } else {
      this.hintEl.style.display = '';
      const text = this.hintEl.querySelector('.hint__text')!;
      text.textContent =
        this.armed === 'swap' ? 'Select two tiles to swap.' : 'Select a tile to delete.';
    }
  }

  private bumpScore(): void {
    this.scoreVal.classList.remove('is-bump');
    void this.scoreVal.offsetWidth; // restart animation
    this.scoreVal.classList.add('is-bump');
  }

  /**
   * Update a score readout. When `anim.force` is set (mode/size switch) the
   * odometer rolls regardless of direction. Without `anim.force` it only rolls
   * on decreases — so normal play (score only goes up) is never disturbed.
   */
  private setScore(
    el: HTMLElement,
    value: number,
    prev: number,
    anim?: { force?: boolean; dir?: 'down' | 'up' },
  ): void {
    const text = String(value);
    if (anim?.force) {
      this.scrollScoreTo(el, text, anim.dir ?? 'down');
    } else if (value < prev) {
      this.scrollScoreTo(el, text, 'down');
    } else {
      el.textContent = text;
    }
  }

  private scrollScoreTo(el: HTMLElement, text: string, dir: 'down' | 'up'): void {
    const prev = el.textContent ?? '';
    el.textContent = '';
    const reel = document.createElement('span');
    reel.className = 'score-reel';
    const top = document.createElement('span');
    const bottom = document.createElement('span');
    if (dir === 'down') {
      // new enters from below: [old, new], roll up
      top.textContent = prev;
      bottom.textContent = text;
      reel.style.transform = 'translateY(0)';
    } else {
      // new enters from above: [new, old], roll down
      top.textContent = text;
      bottom.textContent = prev;
      reel.style.transform = 'translateY(-50%)';
    }
    reel.append(top, bottom);
    el.appendChild(reel);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        reel.style.transform = dir === 'down' ? 'translateY(-50%)' : 'translateY(0)';
      }),
    );
    window.setTimeout(() => {
      if (el.firstElementChild === reel) el.textContent = text;
    }, 420);
  }

  // ---------- Mode badge crossfade ----------
  private animateModeBadge(newMode: string): void {
    const badge = this.modeBadge;
    const oldText = badge.textContent ?? '';
    if (oldText === newMode) return;

    // Fade out → swap text → fade back in. Width transitions naturally
    // because the element stays in the DOM — no inline style overrides.
    badge.classList.add('mode-badge--fading');
    void badge.offsetWidth; // force reflow so the fade-out actually plays

    setTimeout(() => {
      badge.textContent = newMode;
      badge.classList.remove('mode-badge--fading');
    }, 120);

    // Clean up any leftover inline width from previous runs
    setTimeout(() => {
      badge.style.width = '';
    }, 240);
  }

  // ---------- Primary button toggle (New Game / Resume) ----------
  private updatePrimaryButton(): void {
    if (this.pendingNew) {
      this.newGameBtn.textContent = 'Resume';
      this.newGameBtn.classList.remove('btn--primary');
      this.newGameBtn.classList.add('btn--ghost');
    } else {
      this.newGameBtn.textContent = 'New Game';
      this.newGameBtn.classList.add('btn--primary');
      this.newGameBtn.classList.remove('btn--ghost');
    }
  }

  /** Commit the pending new game (if any) and revert the button to New Game. */
  private clearPendingNew(): void {
    if (!this.pendingNew) return;
    this.pendingNew = false;
    this.saveCurrent();
    this.updatePrimaryButton();
  }

  private handleWinOver(): void {
    const s = this.session.state;
    if (s.over) {
      this.showOverlay({
        title: 'Game over!',
        message: 'No moves left.',
        score: s.score,
        actions: [
          { label: 'Keep board', onClick: () => this.closeOverlay() },
          { label: 'New Game', primary: true, onClick: () => this.newGame() },
        ],
      });
      this.stopAuto();
    } else if (s.won && !s.wonAcknowledged) {
      if (this.autoOn) {
        this.session.acknowledgeWin();
        this.saveCurrent();
      } else {
        this.showOverlay({
          title: 'You win!',
          titleClass: 'overlay__title--win',
          message: 'You reached 2048!',
          actions: [
            { label: 'Keep going', primary: true, onClick: () => this.acknowledgeWin() },
            { label: 'New Game', onClick: () => this.newGame() },
          ],
        });
      }
    }
  }

  private acknowledgeWin(): void {
    this.session.acknowledgeWin();
    this.saveCurrent();
    this.closeOverlay();
  }

  // ---------- Overlays ----------
  private showOverlay(opts: {
    title: string;
    titleClass?: string;
    message?: string;
    score?: number;
    actions: OverlayAction[];
  }): void {
    this.closeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const card = document.createElement('div');
    card.className = 'overlay__card';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'overlay__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = Icons.close;
    closeBtn.addEventListener('click', () => this.closeOverlay());
    card.appendChild(closeBtn);
    const title = document.createElement('div');
    title.className = 'overlay__title' + (opts.titleClass ? ` ${opts.titleClass}` : '');
    title.textContent = opts.title;
    card.appendChild(title);
    if (opts.score !== undefined) {
      const sc = document.createElement('div');
      sc.className = 'overlay__score';
      sc.textContent = String(opts.score);
      card.appendChild(sc);
    }
    if (opts.message) {
      const msg = document.createElement('div');
      msg.className = 'overlay__msg';
      msg.textContent = opts.message;
      card.appendChild(msg);
    }
    const actWrap = document.createElement('div');
    actWrap.className = 'overlay__actions';
    for (const a of opts.actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.primary ? ' btn--primary' : ' btn--ghost');
      b.textContent = a.label;
      b.addEventListener('click', () => a.onClick());
      actWrap.appendChild(b);
    }
    card.appendChild(actWrap);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.currentOverlay = overlay;
  }

  private closeOverlay(): void {
    if (this.currentOverlay) {
      this.currentOverlay.remove();
      this.currentOverlay = null;
    }
  }

  // ---------- Auto-play ----------
  private toggleAuto(force?: boolean): void {
    this.clearPendingNew();
    const next = force ?? !this.autoOn;
    if (next) this.startAuto();
    else this.stopAuto();
  }

  private startAuto(): void {
    if (this.autoOn) return;
    this.autoOn = true;
    this.data.settings.autoOn = true;
    this.persist();
    this.popover.update({ autoOn: true });
    this.updateUI();
    this.autoTick();
  }

  private stopAuto(): void {
    this.autoOn = false;
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    this.data.settings.autoOn = false;
    this.persist();
    this.popover.update({ autoOn: false });
    this.updateUI();
  }

  private autoTick(): void {
    this.autoTimer = setTimeout(async () => {
      this.autoTimer = null;
      if (!this.autoOn) return;
      const s = this.session.state;
      if (s.over || this.board.isSelecting || this.currentOverlay) {
        this.stopAuto();
        return;
      }
      const dir = await PlaceholderEngine.chooseMove(this.session.toContext());
      if (!this.autoOn) return;
      if (!dir) {
        this.stopAuto();
        return;
      }
      this.doMove(dir);
      if (this.autoOn && !this.session.state.over) this.autoTick();
    }, this.data.settings.autoSpeed);
  }

  // ---------- Theme & settings ----------
  private onThemeToggle(): void {
    this.clearPendingNew();
    const pref = toggleTheme();
    this.data.settings.theme = pref;
    this.persist();
    this.themeBtn.innerHTML = currentResolved() === 'dark' ? Icons.sun : Icons.moon;
    this.popover.update({ theme: pref });
  }

  private onThemePref(pref: 'light' | 'dark' | 'system'): void {
    this.clearPendingNew();
    setThemePref(pref);
    this.data.settings.theme = pref;
    this.persist();
    this.themeBtn.innerHTML = currentResolved() === 'dark' ? Icons.sun : Icons.moon;
    this.popover.update({ theme: pref });
  }

  private confirmClearAll(): void {
    this.popover.close();
    this.showOverlay({
      title: 'Clear all progress?',
      message: 'Every saved game and best score, across all sizes and modes, will be erased.',
      actions: [
        { label: 'Cancel', onClick: () => this.closeOverlay() },
        {
          label: 'Clear everything',
          primary: true,
          onClick: () => {
            clearGames(this.data);
            this.persist();
            this.closeOverlay();
            this.loadGame(this.size, this.mode);
          },
        },
      ],
    });
  }

  // ---------- Persistence ----------
  private saveCurrent(): void {
    putGame(this.data, this.session.state);
    this.persist();
  }

  private persist(): void {
    save(this.data);
  }

  /** Tear down listeners (e.g. for hot-module reload during dev). */
  destroy(): void {
    this.stopAuto();
    this.closeOverlay();
    this.input.destroy();
    this.board.destroy();
  }
}
