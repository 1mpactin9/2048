import type { AutoAction, Direction, EngineContext, GameMode, GameState, Powerups, Grid } from '../core/types';
import { DEFAULT_MODE, DEFAULT_SIZE, MAX_HISTORY } from '../core/constants';
import {
  type StoredData,
  clearGames,
  getGame,
  load,
  putGame,
  save,
} from '../core/storage';
import { GameSession, restoreSession } from '../core/session';
import { hasMoves, emptyCells, createGrid } from '../core/grid';
import { move } from '../core/move';
import {
  clampScoreToWindow,
  planBypass,
  scoreWindow,
  validatePosition,
  type ValidationResult,
} from '../core/validate';
import { SecureRng } from '../core/rng';
import { SPAWN_PROB_4 } from '../core/constants';
import { WasmEngine } from '../core/wasm-engine';
import { BoardRenderer } from './board';
import { Input } from './input';
import { SettingsPopover } from './controls';
import { NotificationCenter } from './notify';
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
  private notifications!: NotificationCenter;

  private size: number;
  private mode: GameMode;
  private pendingNew = false;
  private armed: Armed = 'none';
  private autoOn = false;
  private autoLoopTarget: number | null = null;
  private lastScore = 0;
  private lastBest = 0;
  private lastSize: number;
  private lastMode: GameMode;
  private lastBadgeMode: string | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private autoLoopStart: number | null = null;
  private currentOverlay: HTMLElement | null = null;
  private wasOver = false;

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
  private gameOverBar!: HTMLElement;

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
    this.notifications = new NotificationCenter(app);

    const topbar = document.createElement('header');
    topbar.className = 'topbar';

    const left = document.createElement('div');
    left.className = 'topbar__left';

    this.popover = new SettingsPopover({
      theme: this.data.settings.theme,
      autoOn: this.data.settings.autoOn,
      autoSpeed: this.data.settings.autoSpeed,
      autoDepth: this.data.settings.autoDepth,
      autoPowerups: this.data.settings.autoPowerups,
      rngManip: this.data.settings.rngManip,
      mode: this.mode,
      size: this.size,
      onTheme: (p) => this.onThemePref(p),
      onAuto: (on) => this.toggleAuto(on),
      onAutoSpeed: (ms) => this.onAutoSpeed(ms),
      onAutoDepth: (d) => this.onAutoDepth(d),
      onAutoPowerups: (on) => this.onAutoPowerups(on),
      onRngManip: (on) => this.onRngManip(on),
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

    const gameOverBar = document.createElement('div');
    gameOverBar.className = 'game-over-bar';
    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'game-over-bar__action btn btn--primary';
    goBtn.textContent = 'Play Again';
    goBtn.addEventListener('click', () => this.confirmNewGame());
    gameOverBar.append(goBtn);
    this.gameOverBar = gameOverBar;

    stage.append(hintEl, powerups, gameOverBar);

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
      this.session = GameSession.newGame(size, mode, 0, undefined, this.data.settings.rngManip);
      putGame(this.data, this.session.state);
      this.persist();
    }
    this.session.setRngManipulation(this.data.settings.rngManip);
    this.pendingNew = false;
    this.board.setSize(size);
    this.board.fullRender(this.session.state.grid, !saved);
    this.updateUI();
    this.wasOver = this.session.state.over;
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
    this.session = GameSession.newGame(this.size, this.mode, best, undefined, this.data.settings.rngManip);
    this.session.setRngManipulation(this.data.settings.rngManip);
    this.wasOver = false;
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
    this.session.setRngManipulation(this.data.settings.rngManip);
    this.pendingNew = false;
    this.wasOver = false;
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

    this.setFrozen(s.over);

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
      // Show the modal only at the instant the game ends (false -> over),
      // and only for human-driven play. When the engine is auto-playing, a
      // blocking "you lost" popup reads as the game accusing the player of
      // losing something they weren't even steering - so we skip it and
      // just leave the below-board frozen indicator (setFrozen, called from
      // updateUI) to communicate the same thing without interrupting.
      if (!this.wasOver && !this.autoOn) {
        this.showOverlay({
          title: 'Game over!',
          message: 'No moves left.',
          score: s.score,
          actions: [
            { label: 'Keep board', onClick: () => this.closeOverlay() },
            { label: 'New Game', primary: true, onClick: () => this.newGame() },
          ],
        });
      }
      // During auto-loop, let autoTick decide whether to restart or stop.
      if (!this.autoLoopTarget) this.stopAuto();
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
    this.wasOver = s.over;
  }

  private acknowledgeWin(): void {
    this.session.acknowledgeWin();
    this.saveCurrent();
    this.closeOverlay();
  }

  /** Toggle the frozen-board look + below-board game-over indicator. */
  private setFrozen(frozen: boolean): void {
    // Strip all effects from the board itself; only the below-board panel
    // communicates game over state. No icy overlay, no saturation shift.
    this.board.el.classList.remove('is-frozen');
    this.gameOverBar.classList.toggle('is-visible', frozen);
  }

  // ---------- Overlays ----------
  private showOverlay(opts: {
    title: string;
    titleClass?: string;
    message?: string;
    score?: number;
    danger?: boolean;
    actions: OverlayAction[];
  }): void {
    this.closeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const card = document.createElement('div');
    card.className = 'overlay__card' + (opts.danger ? ' overlay__card--danger' : '');
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
      b.className =
        'btn' +
        (a.primary ? (opts.danger ? ' btn--danger' : ' btn--primary') : ' btn--ghost');
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

  /** Small top-right auto-hiding toast (see notify.ts). */
  private notify(message: string, icon?: string): void {
    this.notifications.show(message, { icon, duration: 3000 });
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
    this.autoLoopTarget = null;
    this.autoLoopStart = null;
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    this.data.settings.autoOn = false;
    this.persist();
    this.popover.update({ autoOn: false });
    this.updateUI();
  }

  /**
   * Start the engine looping until the score reaches `targetScore`.
   * Reuses the existing auto-play loop; stops and turns off the engine
   * toggle when the target is hit (or at game-over / engine stop).
   *
   * Exposed on `window` for dev-console usage:
   *   __runAutoLoop(5000)  // plays until score >= 5000
   */
  runAutoLoop(targetScore: number): void {
    if (this.session.state.over) return;
    if (this.autoOn) this.stopAuto();
    this.autoLoopTarget = targetScore;
    this.autoLoopStart = Date.now();
    this.startAuto();
    this.notify(`Engine looping to ${targetScore}`, Icons.engine);
  }

  private autoTick(): void {
    this.autoTimer = setTimeout(async () => {
      this.autoTimer = null;
      if (!this.autoOn) return;
      const s = this.session.state;
      if (this.board.isSelecting || this.currentOverlay) {
        // User is interacting — pause the loop.
        this.stopAuto();
        return;
      }
      if (s.over) {
        // Auto-loop: restart the game when stuck so the engine keeps playing.
        if (this.autoLoopTarget !== null) {
          if (this.session.state.score >= this.autoLoopTarget) {
            const elapsed = this.autoLoopStart ? ((Date.now() - this.autoLoopStart) / 1000 | 0) : 0;
            this.notify(`Engine completed ${this.session.state.score}` + (elapsed > 0 ? ` in ${elapsed}s` : ''), Icons.engine);
            this.stopAuto();
            return;
          }
          this.newGame();
          if (this.autoOn && !this.session.state.over) {
            this.autoTick();
          }
          return;
        }
        this.stopAuto();
        return;
      }
      const ctx: EngineContext = {
        ...this.session.toContext(),
        depth: this.data.settings.autoDepth,
        usePowerups: this.data.settings.autoPowerups,
      };
      // The engine now decides off the main thread (see WasmEngine), so a human
      // move / undo / power-up / new game can change the board while we wait.
      // Snapshot what we're deciding for; if it changed, the result was
      // computed for a board that no longer exists, so discard it and re-tick
      // instead of applying a stale (possibly illegal) action.
      const signature = this.boardSignature();
      const action = await WasmEngine.chooseAction(ctx);
      if (!this.autoOn) return;
      if (this.boardSignature() !== signature) {
        if (this.autoOn && !this.session.state.over) this.autoTick();
        return;
      }
      this.applyAutoAction(action);
      // Auto-loop: when the engine hits game over mid-action, restart or stop.
      if (this.autoOn && this.session.state.over && this.autoLoopTarget !== null) {
        if (this.session.state.score >= this.autoLoopTarget) {
          const elapsed = this.autoLoopStart ? ((Date.now() - this.autoLoopStart) / 1000 | 0) : 0;
          this.notify(`Engine completed ${this.session.state.score} in ${elapsed}s`, Icons.engine);
          this.stopAuto();
        } else {
          this.newGame();
          if (this.autoOn) this.autoTick();
        }
      } else if (this.autoOn && !this.session.state.over) {
        this.autoTick();
      }
    }, this.data.settings.autoSpeed);
  }

  /**
   * Compact fingerprint of the live board + score + power-up charges. Used only
   * to detect that *something* gameplay-relevant changed during an async engine
   * decision - the exact value is irrelevant, only equality is. Cheap (boards
   * are at most 8x8) and self-contained, so it needs no hooks in every mutation
   * site.
   */
  private boardSignature(): string {
    const s = this.session.state;
    const g = s.grid;
    let out = `${s.size}:${s.score}:${s.powerups.undo}:${s.powerups.swap}:${s.powerups.delete}:`;
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      for (let c = 0; c < row.length; c++) out += (row[c]?.value ?? 0) + ',';
    }
    return out;
  }

  /** Apply one AI action (move, swap, delete, or stop) during auto-play. */
  private applyAutoAction(action: AutoAction): void {
    switch (action.kind) {
      case 'move':
        this.doMove(action.dir);
        break;
      case 'delete': {
        if (!this.session.canDelete) {
          this.stopAuto();
          return;
        }
        this.clearPendingNew();
        this.session.deleteTile(action.row, action.col);
        this.saveCurrent();
        this.board.fullRender(this.session.state.grid);
        this.updateUI();
        this.notify('Engine used Delete', Icons.delete);
        this.handleWinOver();
        break;
      }
      case 'swap': {
        if (!this.session.canSwap) {
          this.stopAuto();
          return;
        }
        this.clearPendingNew();
        const g = this.session.state.grid;
        const a = g[action.r1]?.[action.c1];
        const b = g[action.r2]?.[action.c2];
        if (!a || !b) {
          this.stopAuto();
          return;
        }
        this.session.swap(action.r1, action.c1, action.r2, action.c2);
        this.saveCurrent();
        this.board.animateSwap(a.id, b.id);
        this.updateUI();
        this.notify('Engine used Swap', Icons.swap);
        this.handleWinOver();
        break;
      }
      case 'stop': {
        // Engine returned stop = no legal moves. Force game-over state so the
        // auto-loop can properly decide whether to restart or stop.
        this.session.state.over = true;
        this.handleWinOver();
        if (this.autoLoopTarget !== null) {
          if (this.session.state.score >= this.autoLoopTarget) {
            const elapsed = this.autoLoopStart ? ((Date.now() - this.autoLoopStart) / 1000 | 0) : 0;
            this.notify(`Engine completed ${this.session.state.score}` + (elapsed > 0 ? ` in ${elapsed}s` : ''), Icons.engine);
            this.stopAuto();
          } else {
            // Auto-loop: always restart, regardless of current best score.
            this.newGame();
            if (this.autoOn) this.autoTick();
          }
        } else {
          this.stopAuto();
        }
        break;
      }
    }
  }

  // ---------- Auto-play settings ----------
  private onAutoSpeed(ms: number): void {
    this.data.settings.autoSpeed = ms;
    this.persist();
    this.popover.update({ autoSpeed: ms });
  }

  private onAutoDepth(depth: number): void {
    this.data.settings.autoDepth = depth;
    this.persist();
    this.popover.update({ autoDepth: depth });
  }

  private onAutoPowerups(on: boolean): void {
    this.data.settings.autoPowerups = on;
    this.persist();
    this.popover.update({ autoPowerups: on });
  }

  // RNG Manipulation toggle: biases tile spawns (via the same ChaCha20
  // stream - see grid.ts) toward the player's favor. Takes effect
  // immediately on the live session, no new game required.
  private onRngManip(on: boolean): void {
    this.data.settings.rngManip = on;
    this.session.setRngManipulation(on);
    this.persist();
    this.popover.update({ rngManip: on });
    this.notify(on ? 'RNG Manipulation enabled' : 'RNG Manipulation disabled', Icons.dice);
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
      danger: true,
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

  // ---------- Developer console helpers ----------

  /** Bypass-powerup undo: reverts up to `steps` past moves.
   * Default 1 step. Negative values instead enable the auto-engine
   * and run it for `Math.abs(steps)` moves. */
  __undo(steps?: number): void {
    const n = steps ?? 1;
    if (n < 0) {
      // Enable engine for |n| moves using current engine settings
      const count = Math.abs(n);
      this.data.settings.autoOn = true;
      let done = 0;
      const tick = () => {
        if (done >= count || this.session.state.over || !this.data.settings.autoOn) return;
        const ctx: EngineContext = {
          ...this.session.toContext(),
          depth: this.data.settings.autoDepth,
          usePowerups: this.data.settings.autoPowerups,
        };
        (async () => {
          const raw = await WasmEngine.chooseAction(ctx);
          const action: AutoAction = raw instanceof Promise ? await raw : raw;
          if (action.kind === 'stop' || this.session.state.over) {
            this.data.settings.autoOn = false;
            return;
          }
          this.applyAutoAction(action);
          done++;
          setTimeout(tick, this.data.settings.autoSpeed);
        })();
      };
      tick();
      console.log(`[dev] __undo → engine enabled for ${count} moves`);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!this.session.state.history.length) break;
      const snap = this.session.state.history.pop()!;
      this.session.state.grid = snap.grid;
      this.session.state.score = snap.score;
      this.session.state.won = snap.won;
      this.session.state.wonAcknowledged = snap.wonAcknowledged;
      this.session.state.moveCount = snap.moveCount;
      this.session.state.powerups = { ...snap.powerups };
    }
    this.recomputeOver();
    this.saveCurrent();
    this.board.fullRender(this.session.state.grid);
    this.updateUI();
    this.handleWinOver();
    console.log('[dev] __undo →', n, 'step(s), score', this.session.state.score);
  }

  /** Delete the tile at grid position [row, col]. */
  __delete(row: number, col: number): void {
    const g = this.session.state.grid;
    if (row < 0 || row >= g.length || col < 0 || col >= g[row].length) {
      console.warn(`[dev] __delete → out of bounds (${row},${col})`);
      return;
    }
    if (!g[row][col]) { console.warn('[dev] __delete:', row, col, 'is empty'); return; }
    this.clearPendingNew();
    g[row][col] = null;
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log('[dev] __delete → removed tile at', row, col);
  }

  /** Delete all tiles with value `n` from the board. */
  __deleteValue(n: number): void {
    const g = this.session.state.grid;
    let count = 0;
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const cell = g[r][c];
        if (cell && cell.value === n) {
          g[r][c] = null;
          count++;
        }
      }
    }
    if (count === 0) { console.warn(`[dev] __deleteValue → no ${n}-tiles found`); return; }
    this.clearPendingNew();
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log(`[dev] __deleteValue → removed ${count} tile(s) of value ${n}`);
  }

  /** Swap the tiles at [r1,c1] and [r2,c2]. Both must be occupied. */
  __swap(r1: number, c1: number, r2: number, c2: number): void {
    const g = this.session.state.grid;
    if (r1 === r2 && c1 === c2) return;
    const a = g[r1]?.[c1];
    const b = g[r2]?.[c2];
    if (!a || !b) { console.warn('[dev] __swap:', r1, c1, r2, c2, 'must both be occupied'); return; }
    this.clearPendingNew();
    g[r1][c1] = b;
    g[r2][c2] = a;
    this.saveCurrent();
    this.board.animateSwap(a.id, b.id);
    this.updateUI();
    console.log('[dev] __swap →', r1, c1, '<->', r2, c2);
  }

  /** Add n free tiles (value 2) at random empty cells. */
  __addTiles(n = 1): void {
    const g = this.session.state.grid;
    const empties: { r: number; c: number }[] = [];
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (!g[r][c]) empties.push({ r, c });
    const count = Math.min(n, empties.length);
    // Fisher-Yates partial shuffle to pick `count` distinct spots
    for (let i = 0; i < count; i++) {
      const idx = i + Math.floor(Math.random() * (empties.length - i));
      [empties[idx], empties[i]] = [empties[i], empties[idx]];
    }
    for (let i = 0; i < count; i++) {
      const spot = empties[i];
      g[spot.r][spot.c] = { id: freshDevId(), value: 2 };
    }
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log(`[dev] __addTiles → spawned ${count} tiles`);
  }

  /** Clear every tile from the board. */
  __clear(): void {
    const g = this.session.state.grid;
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++) g[r][c] = null;
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log('[dev] __clear → board emptied');
  }

  /** Fill the board with tiles of value `val` (default 2), one per cell. */
  __fill(val = 2): void {
    const g = this.session.state.grid;
    let id = 1;
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        g[r][c] = { id: id++, value: val };
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log(`[dev] __fill → ${val} everywhere`);
  }

  /** Set the score to `n`. */
  __score(n: number): void {
    this.session.state.score = n;
    this.session.state.best = Math.max(this.session.state.best, n);
    this.saveCurrent();
    this.updateUI();
    console.log(`[dev] __score → set to ${n}`);
  }

  /**
   * Place a tile on the board. Four signatures:
   *
   * | Call | Meaning |
   * |------|---------|
   * | `__add(val)` | Place `val` at first empty cell (smallest row, then col). |
   * | `__add(x, y)` | Place a **2** at grid position `(x, y)`. |
   * | `__add(val, x, y)` | Place `val` at `(x, y)`. Fails if occupied. |
   * | `__add(val, x, y, 1)` | Same as above but **replace** if occupied. |
   */
  __add(a: number, b?: number, c?: number, _replace?: number): void {
    const g = this.session.state.grid;

    // 4 args → __add(val, x, y, replaceFlag)
    if (b !== undefined && c !== undefined && _replace !== undefined) {
      const val = a as number;
      const x = b as number;
      const y = c as number;
      if (x < 0 || x >= g.length || y < 0 || y >= g[x].length) {
        console.warn(`[dev] __add → out of bounds (${x},${y})`);
        return;
      }
      if (g[x][y] && !_replace) {
        console.warn(`[dev] __add → cell (${x},${y}) already occupied — pass 1 as 4th arg to force-replace`);
        return;
      }
      g[x][y] = { id: freshDevId(), value: val };
      this.saveCurrent();
      this.board.fullRender(g);
      this.updateUI();
      console.log(`[dev] __add → placed ${val} at ${x},${y}${_replace ? ' (replaced)' : ''}`);
      return;
    }

    // 2 args → __add(x, y), place a 2
    if (b !== undefined && c === undefined) {
      const x = a as number;
      const y = b as number;
      if (x < 0 || x >= g.length || y < 0 || y >= g[x].length) {
        console.warn(`[dev] __add → out of bounds (${x},${y})`);
        return;
      }
      if (g[x][y]) {
        console.warn(`[dev] __add → cell (${x},${y}) already occupied`);
        return;
      }
      g[x][y] = { id: freshDevId(), value: 2 };
      this.saveCurrent();
      this.board.fullRender(g);
      this.updateUI();
      console.log(`[dev] __add → placed 2 at ${x},${y}`);
      return;
    }

    // 1 arg → __add(val), place at first empty cell
    {
      const val = a as number;
      for (let r = 0; r < g.length; r++) {
        for (let c = 0; c < g[r].length; c++) {
          if (!g[r][c]) {
            g[r][c] = { id: freshDevId(), value: val };
            this.saveCurrent();
            this.board.fullRender(g);
            this.updateUI();
            console.log(`[dev] __add → placed ${val} at first empty cell (${r},${c})`);
            return;
          }
        }
      }
      console.warn('[dev] __add → board is full');
    }
  }

  /** Place a single tile of value `val` at [row, col]. Overwrites if occupied. */
  __max(row: number, col: number, val = 2048): void {
    const g = this.session.state.grid;
    if (row < 0 || row >= g.length || col < 0 || col >= g[row].length) {
      console.warn(`[dev] __max → out of bounds (${row},${col})`);
      return;
    }
    g[row][col] = { id: freshDevId(), value: val };
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log(`[dev] __max → placed ${val} at ${row},${col}`);
  }

  /** Set move count to `n`. */
  __moves(n: number): void {
    this.session.state.moveCount = n;
    this.saveCurrent();
    console.log(`[dev] __moves → set to ${n}`);
  }

  /** Apply a directional move WITHOUT spawning a tile (free experiment). */
  __cheat(dir: Direction): void {
    const { grid: next, transcript } = move(this.session.state.grid, dir);
    if (!transcript.moved) { console.warn('[dev] __cheat:', dir, 'had no effect'); return; }
    this.clearPendingNew();
    this.session.state.grid = next;
    this.session.state.score += transcript.gained;
    this.saveCurrent();
    this.board.animateMove(transcript);
    this.updateUI();
    console.log(`[dev] __cheat → ${dir}, gained ${transcript.gained}`);
  }

  /** Max out all powerup charges. */
  __fillPowerups(): void {
    this.session.state.powerups = { undo: 99, swap: 99, delete: 99 };
    this.saveCurrent();
    this.updateUI();
    console.log('[dev] __fillPowerups → 99 each');
  }

  /** Instantly win: place a 2048 tile on a random empty cell. */
  __win(): void {
    const g = this.session.state.grid;
    const empties: { r: number; c: number }[] = [];
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (!g[r][c]) empties.push({ r, c });
    if (empties.length === 0) { console.warn('[dev] __win → board is full'); return; }
    const spot = empties[Math.floor(Math.random() * empties.length)];
    g[spot.r][spot.c] = { id: freshDevId(), value: 2048 };
    this.session.state.won = true;
    this.session.state.wonAcknowledged = false;
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    console.log(`[dev] __win → placed 2048 at ${spot.r},${spot.c}`);
  }

  /**
   * Start the engine with zero delay between moves for maximum speed.
   * Equivalent to setting DELAY to 0 and enabling auto-play.
   */
  __noDelay(): void {
    this.data.settings.autoSpeed = 0;
    this.persist();
    if (!this.autoOn) this.startAuto();
    this.popover.update({ autoSpeed: 0 });
    console.log('[dev] __noDelay → engine started with zero delay');
  }

  /**
   * Peek the next spawn value from the CSPRNG stream.
   * Returns 2 or 4 (10% chance of 4), without advancing game state.
   */
  __nextNumber(): number {
    const seed = this.session.state.rngSeed;
    const calls = this.session.state.rngCalls ?? 0;
    if (!seed || seed.length < 8) {
      console.warn('[dev] __nextNumber → no RNG seed available');
      return -1;
    }
    // Clone the RNG to peek without consuming
    const gen = new SecureRng(seed, calls);
    // Advance past all spawns that have already happened:
    // Each move triggers exactly 1 spawn call. The session started with 2 spawns.
    const totalSpawns = 2 + this.session.state.moveCount;
    for (let i = 0; i < totalSpawns; i++) gen.next();
    const roll = gen.next();
    const val = roll < SPAWN_PROB_4 ? 4 : 2;
    console.log(`[dev] __nextNumber → ${val} (rng=${roll.toFixed(4)}, p(4)=${SPAWN_PROB_4})`);
    return val;
  }

  /**
   * Peek the next spawn location from the CSPRNG stream.
   * Returns { row, col } of the cell the next tile will appear in,
   * without advancing game state.
   */
  __nextLocation(): { row: number; col: number } {
    const g = this.session.state.grid;
    const empties: { row: number; col: number }[] = [];
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (!g[r][c]) empties.push({ row: r, col: c });
    if (empties.length === 0) { console.warn('[dev] __nextLocation → board is full'); return { row: -1, col: -1 }; }

    const seed = this.session.state.rngSeed;
    const calls = this.session.state.rngCalls ?? 0;
    if (!seed || seed.length < 8) {
      console.warn('[dev] __nextLocation → no RNG seed available');
      return { row: -1, col: -1 };
    }

    const gen = new SecureRng(seed, calls);
    const totalSpawns = 2 + this.session.state.moveCount;
    for (let i = 0; i < totalSpawns; i++) {
      gen.next(); // advance past value roll
      gen.next(); // advance past position roll
    }
    const posRoll = gen.next();
    const spot = empties[Math.floor(posRoll * empties.length)];
    console.log(`[dev] __nextLocation → ${spot.row},${spot.col} (rng=${posRoll.toFixed(4)}, empties=${empties.length})`);
    return spot;
  }

  /**
   * Check whether the displayed score is consistent with the tiles on the
   * board. Every tile of value V contributes a [min, max] score window (min if
   * it was built purely from 4-spawns, max if purely from 2-spawns); the board's
   * total window must contain the score. Logs the window and verdict, returns
   * the full result.
   */
  __validate(): ValidationResult {
    const r = validatePosition(this.session.state.grid, this.session.state.score);
    const tag = r.valid
      ? 'VALID'
      : r.score < r.min
        ? `BELOW MIN by ${r.min - r.score}`
        : `ABOVE MAX by ${r.score - r.max}`;
    console.log(
      `[dev] __validate -> ${tag}  | score=${r.score} window=[${r.min}, ${r.max}] tiles=${r.tileCount}`,
    );
    return r;
  }

  /**
   * Clamp the score into the board's valid window so it matches a hacked
   * position. A score below the minimum is raised to it; a score above the
   * maximum is lowered to it; an in-window score is left alone. Mutates and
   * persists state.
   */
  __updatePosition(): { from: number; to: number; min: number; max: number; changed: boolean } {
    const r = clampScoreToWindow(this.session.state.grid, this.session.state.score);
    const changed = r.to !== r.from;
    if (changed) {
      this.session.state.score = r.to;
      this.session.state.best = Math.max(this.session.state.best, r.to);
      this.clearPendingNew();
      this.saveCurrent();
      this.updateUI();
      console.log(`[dev] __updatePosition -> score ${r.from} -> ${r.to} (window [${r.min}, ${r.max}])`);
    } else {
      console.log(`[dev] __updatePosition -> already valid (score ${r.from} in [${r.min}, ${r.max}])`);
    }
    return { from: r.from, to: r.to, min: r.min, max: r.max, changed };
  }

  /**
   * Remove the fewest tiles (then the least total value) so the remaining board
   * is valid for the current score. Fixes hacked-in tiles that the score cannot
   * account for (e.g. a 32768 dropped onto a near-zero board). A score above the
   * maximum cannot be fixed by removal and is reported infeasible. Mutates and
   * persists state.
   */
  __bypassValidation(valueFirst = false): {
    feasible: boolean;
    removed: number;
    totalValue: number;
    heuristic: boolean;
    valid: boolean;
  } {
    const g = this.session.state.grid;
    const score = this.session.state.score;
    const plan = planBypass(g, score, valueFirst);
    if (plan.alreadyValid) {
      console.log('[dev] __bypassValidation -> position already valid, nothing removed');
      return { feasible: true, removed: 0, totalValue: 0, heuristic: false, valid: true };
    }
    if (!plan.feasible) {
      console.warn(
        `[dev] __bypassValidation -> cannot make valid by removing tiles (score ${score} is outside every subset's window)`,
      );
      return { feasible: false, removed: 0, totalValue: 0, heuristic: plan.heuristic, valid: false };
    }
    this.clearPendingNew();
    let totalValue = 0;
    for (const t of plan.remove) {
      g[t.row][t.col] = null;
      totalValue += t.value;
    }
    this.recomputeOver();
    this.saveCurrent();
    this.board.fullRender(g);
    this.updateUI();
    this.handleWinOver();
    const after = validatePosition(g, score);
    const note = plan.heuristic ? ' (heuristic - may not be perfectly minimal)' : '';
    console.log(
      `[dev] __bypassValidation -> removed ${plan.remove.length} tile(s) totalling ${totalValue}${note}; ` +
        `priority=${valueFirst ? 'value-first' : 'count-first'}; ` +
        `window now [${plan.after.min}, ${plan.after.max}], valid=${after.valid}`,
    );
    return {
      feasible: true,
      removed: plan.remove.length,
      totalValue,
      heuristic: plan.heuristic,
      valid: after.valid,
    };
  }

  // ---------- New dev methods (getStats, setBoard, evalPosition, afkHighScore, updateScore) ----------

  /**
   * Comprehensive board / session / UI diagnostics dump.
   * Returns an object with every relevant piece of information about the
   * current position, engine config, RNG state, validation, and UI.
   */
  __getStats(): {
    board: {
      type: string;
      size: number;
      mode: GameMode;
      fullness: number;
      emptyCells: number;
      tileCount: number;
      maxTile: number;
      minTile: number;
      avgTile: number;
      uniqueValues: number[];
      valueDistribution: Record<string, number>;
      bitboard: number[][];
      tileIds: number[][];
      log2Grid: number[][];
      smoothness: number;
      monotonicity: number;
      openLines: number;
      mergeablePairs: number;
    };
    scores: {
      current: number;
      best: number;
      delta: number;
      windowMin: number;
      windowMax: number;
      valid: boolean;
      belowBy: number;
      aboveBy: number;
    };
    position: {
      over: boolean;
      won: boolean;
      wonAcknowledged: boolean;
      moveCount: number;
      hasLegalMoves: boolean;
    };
    rng: {
      seed: number[] | null;
      calls: number;
      nextPredictedValue: number;
      nextPredictedLocation: { row: number; col: number } | null;
    };
    engine: {
      name: string;
      autoOn: boolean;
      autoSpeed: number;
      autoDepth: number;
      autoPowerups: boolean;
      manipulate: boolean;
    };
    powerups: Powerups;
    history: {
      length: number;
      maxHistory: number;
      canUndo: boolean;
    };
    ui: {
      armed: Armed;
      pendingNew: boolean;
      hasOverlay: boolean;
      isSelecting: boolean;
      theme: 'light' | 'dark';
      lastScore: number;
      lastBest: number;
      gameOverBarVisible: boolean;
    };
    validation: {
      valid: boolean;
      score: number;
      min: number;
      max: number;
      belowBy: number;
      aboveBy: number;
      tileCount: number;
    };
    timestamp: number;
  } {
    const s = this.session.state;
    const g = s.grid;
    const size = s.size;

    // --- Board analysis ---
    const values: number[] = [];
    const dist: Record<string, number> = {};
    let maxT = 0;
    let minT = Infinity;
    let sumT = 0;
    let empties = 0;
    let mergeable = 0;
    let openLines = 0;
    let smoothness = 0;
    let monotonicity = 0;

    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const cell = g[r][c];
        if (!cell) {
          empties++;
          continue;
        }
        values.push(cell.value);
        const key = String(cell.value);
        dist[key] = (dist[key] ?? 0) + 1;
        if (cell.value > maxT) maxT = cell.value;
        if (cell.value < minT) minT = cell.value;
        sumT += cell.value;

        // Smoothness: sum of log2 differences between adjacent tiles
        const v = Math.log2(cell.value);
        const right = g[r][c + 1];
        if (right) smoothness += Math.abs(v - Math.log2(right.value));
        const down = g[r + 1]?.[c];
        if (down) smoothness += Math.abs(v - Math.log2(down.value));

        // Mergeable pairs
        if (c + 1 < g[r].length && g[r][c + 1] && g[r][c + 1]!.value === cell.value) mergeable++;
        if (r + 1 < g.length && g[r + 1][c] && g[r + 1][c]!.value === cell.value) mergeable++;

        // Open lines per row/col (consecutive empty cells at edges)
        if (c === 0 && !g[r][c]) openLines++;
        if (r === 0 && !g[r][c]) openLines++;
      }
    }

    // Monotonicity: count decreasing adjacent pairs (rightward + downward)
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const val = g[r][c]?.value ?? 0;
        const right = g[r][c + 1]?.value ?? 0;
        const down = g[r + 1]?.[c]?.value ?? 0;
        if (val > right) monotonicity++;
        if (val > down) monotonicity++;
      }
    }

    const tileCount = values.length;
    const avgTile = tileCount > 0 ? sumT / tileCount : 0;

    // Bitboard: each cell mapped to a bit position (r * size + c)
    const bitboard: number[][] = [];
    const idGrid: number[][] = [];
    const log2Grid: number[][] = [];
    for (let r = 0; r < g.length; r++) {
      const bbRow: number[] = [];
      const idRow: number[] = [];
      const l2Row: number[] = [];
      for (let c = 0; c < g[r].length; c++) {
        const cell = g[r][c];
        bbRow.push(cell ? 1 << (r * size + c) : 0);
        idRow.push(cell?.id ?? 0);
        l2Row.push(cell ? Math.log2(cell.value) : 0);
      }
      bitboard.push(bbRow);
      idGrid.push(idRow);
      log2Grid.push(l2Row);
    }

    // --- Validation ---
    const vr = validatePosition(g, s.score);

    // --- RNG prediction ---
    const seed = s.rngSeed ?? null;
    const calls = s.rngCalls ?? 0;
    let predValue = -1;
    let predLoc: { row: number; col: number } | null = null;
    if (seed && seed.length >= 8) {
      const gen = new SecureRng(seed, calls);
      const totalSpawns = 2 + s.moveCount;
      for (let i = 0; i < totalSpawns; i++) { gen.next(); gen.next(); }
      const roll = gen.next();
      predValue = roll < SPAWN_PROB_4 ? 4 : 2;
      const emptiesList = emptyCells(g);
      if (emptiesList.length > 0) {
        const posRoll = gen.next();
        predLoc = emptiesList[Math.floor(posRoll * emptiesList.length)];
      }
    }

    return {
      board: {
        type: `${size}x${size} ${s.mode}`,
        size,
        mode: s.mode,
        fullness: tileCount / (size * size),
        emptyCells: empties,
        tileCount,
        maxTile: maxT,
        minTile: minT === Infinity ? 0 : minT,
        avgTile,
        uniqueValues: [...new Set(values)].sort((a, b) => a - b),
        valueDistribution: dist,
        bitboard,
        tileIds: idGrid,
        log2Grid,
        smoothness,
        monotonicity,
        openLines,
        mergeablePairs: mergeable,
      },
      scores: {
        current: s.score,
        best: s.best,
        delta: s.score - s.best,
        windowMin: vr.min,
        windowMax: vr.max,
        valid: vr.valid,
        belowBy: vr.belowBy,
        aboveBy: vr.aboveBy,
      },
      position: {
        over: s.over,
        won: s.won,
        wonAcknowledged: s.wonAcknowledged,
        moveCount: s.moveCount,
        hasLegalMoves: hasMoves(g),
      },
      rng: {
        seed,
        calls,
        nextPredictedValue: predValue,
        nextPredictedLocation: predLoc,
      },
      engine: {
        name: WasmEngine.name,
        autoOn: this.autoOn,
        autoSpeed: this.data.settings.autoSpeed,
        autoDepth: this.data.settings.autoDepth,
        autoPowerups: this.data.settings.autoPowerups,
        manipulate: this.session.toContext().manipulate ?? false,
      },
      powerups: { ...s.powerups },
      history: {
        length: s.history.length,
        maxHistory: MAX_HISTORY,
        canUndo: this.session.canUndo,
      },
      ui: {
        armed: this.armed,
        pendingNew: this.pendingNew,
        hasOverlay: !!this.currentOverlay,
        isSelecting: this.board.isSelecting,
        theme: currentResolved(),
        lastScore: this.lastScore,
        lastBest: this.lastBest,
        gameOverBarVisible: this.gameOverBar.classList.contains('is-visible'),
      },
      validation: { ...vr },
      timestamp: Date.now(),
    };
  }

  /**
   * Set the board to an arbitrary position from a flat bitboard or values matrix.
   *
   * Signatures:
   * | Call | Meaning |
   * |------|---------|
   * | `__setBoard(values)` | Set grid from `number[][]` (0 = empty). Uses existing size/mode. |
   * | `__setBoard(size, values)` | Create a new game of given size with the values grid. |
   * | `__setBoard(flatArray, size)` | Set from a flat `number[]` of length `size*size` (row-major). |
   * | `__setBoard(flatArray)` | Set from flat array, inferring size from `Math.sqrt(length)`. |
   */
  __setBoard(
    a: number[][] | number[] | number,
    b?: number[][] | number,
  ): void {
    let grid: Grid;
    let size: number;

    if (Array.isArray(a)) {
      // Flat array form: __setBoard(flat, size?)
      const flat = a;
      if (b !== undefined && typeof b === 'number') {
        size = b;
      } else {
        const root = Math.sqrt(flat.length);
        if (!Number.isInteger(root)) {
          console.warn('[dev] __setBoard → flat array length must be a perfect square');
          return;
        }
        size = root;
      }
      if (flat.length !== size * size) {
        console.warn('[dev] __setBoard → flat array length', flat.length, '!= size²', size * size);
        return;
      }
      grid = createGrid(size);
      for (let i = 0; i < flat.length; i++) {
        const row = Math.floor(i / size);
        const col = i % size;
        const val = flat[i];
        if (typeof val === 'number' && val > 0) {
          grid[row][col] = { id: freshDevId(), value: val };
        }
      }
    } else if (Array.isArray(b)) {
      // __setBoard(size, values)
      size = a as number;
      const vals = b as number[][];
      if (vals.length !== size || vals.some((row) => row.length !== size)) {
        console.warn(`[dev] __setBoard → values grid ${vals.length}x${vals[0]?.length} doesn't match size ${size}`);
        return;
      }
      grid = createGrid(size);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (vals[r][c] > 0) {
            grid[r][c] = { id: freshDevId(), value: vals[r][c] };
          }
        }
      }
    } else {
      // __setBoard(values) — existing size (a is number[][], b is undefined)
      const vals = a as unknown as number[][];
      size = this.size;
      if (vals.length !== size || vals.some((row) => row.length !== size)) {
        console.warn(`[dev] __setBoard → values grid ${vals.length}x${vals[0]?.length} doesn't match current size ${size}`);
        return;
      }
      grid = createGrid(size);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (vals[r][c] > 0) {
            grid[r][c] = { id: freshDevId(), value: vals[r][c] };
          }
        }
      }
    }

    // Clamp game-over state since we're fabricating a position
    const wasOver = this.session.state.over;
    this.clearPendingNew();
    this.session.state.grid = grid;
    this.session.state.over = false;
    this.recomputeOver();
    this.saveCurrent();
    this.board.setSize(size);
    this.board.fullRender(grid);
    this.updateUI();
    this.handleWinOver();

    if (wasOver) console.log(`[dev] __setBoard → restored from game-over (${size}x${size}, ${grid.flat().filter(v => v !== null).length} tiles)`);
    else console.log(`[dev] __setBoard → set ${size}x${size} board with ${grid.flat().filter(v => v !== null).length} tiles`);
  }

  /**
   * Evaluate the current position with heuristic scoring.
   * Returns a comprehensive analysis including:
   *   - Current score and best score
   *   - Empty cell count and occupancy ratio
   *   - Max tile and sum of all tiles
   *   - Smoothness score (lower = better tile adjacency)
   *   - Monotonicity score (higher = better ordered layout)
   *   - Open line count
   *   - Estimated highest possible tile achievable
   *   - Estimated eval score (heuristic position quality)
   *   - Predicted score range based on tile composition
   *   - Calculation time in ms
   */
  __evalPosition(): {
    calcTimeMs: number;
    currentScore: number;
    bestScore: number;
    board: {
      size: number;
      mode: GameMode;
      tileCount: number;
      emptyCells: number;
      fullness: number;
      maxTile: number;
      sumTiles: number;
      uniqueValues: number[];
      valueDistribution: Record<string, number>;
    };
    heuristics: {
      emptyBonus: number;
      smoothness: number;
      monotonicity: number;
      maxCorner: boolean;
      singleCorner: boolean;
      mergeablePairs: number;
      openLines: number;
      compositeScore: number;
    };
  } {
    const t0 = performance.now();
    const s = this.session.state;
    const g = s.grid;
    const size = s.size;

    const values: number[] = [];
    const dist: Record<string, number> = {};
    let maxT = 0;
    let sumT = 0;
    let mergeable = 0;
    let openLines = 0;
    let smoothness = 0;
    let mono = 0;

    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const cell = g[r][c];
        if (!cell) continue;
        values.push(cell.value);
        const key = String(cell.value);
        dist[key] = (dist[key] ?? 0) + 1;
        if (cell.value > maxT) maxT = cell.value;
        sumT += cell.value;

        const v = Math.log2(cell.value);
        const right = g[r][c + 1];
        if (right) smoothness += Math.abs(v - Math.log2(right.value));
        const down = g[r + 1]?.[c];
        if (down) smoothness += Math.abs(v - Math.log2(down.value));

        if (c + 1 < g[r].length && g[r][c + 1] && g[r][c + 1]!.value === cell.value) mergeable++;
        if (r + 1 < g.length && g[r + 1][c] && g[r + 1][c]!.value === cell.value) mergeable++;

        if (c === 0 && !g[r][c]) openLines++;
        if (r === 0 && !g[r][c]) openLines++;

        const val = cell.value;
        const rightV = g[r][c + 1]?.value ?? 0;
        const downV = g[r + 1]?.[c]?.value ?? 0;
        if (val > rightV) mono++;
        if (val > downV) mono++;
      }
    }

    const tileCount = values.length;
    const totalCells = size * size;
    const emptyCells = totalCells - tileCount;

    // Heuristic weights (tuned for 2048 strategy)
    const W_EMPTY = 1.0;
    const W_SMOOTH = 0.5;
    const W_MONO = 0.3;
    const W_MERGE = 1.0;
    const W_MAX_CORNER = 2.0;
    const W_SINGLE_CORNER = 0.5;

    // Check if max tile is in a corner
    let maxCorner = false;
    let singleCorner = false;
    if (tileCount > 0) {
      const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
      for (const [cr, cc] of corners) {
        if (g[cr][cc] && g[cr][cc]!.value === maxT) { maxCorner = true; break; }
      }
      singleCorner = maxCorner;
    }

    // Composite score
    const composite =
      emptyCells * W_EMPTY
      - smoothness * W_SMOOTH
      + mono * W_MONO
      + mergeable * W_MERGE
      + (maxCorner ? W_MAX_CORNER : 0)
      + (singleCorner ? W_SINGLE_CORNER : 0);

    // Estimate highest possible tile: log2(maxT) + estimated merges possible
    const estMerges = emptyCells + mergeable;
    const estHighestTile = Math.pow(2, Math.log2(maxT) + Math.floor(estMerges / 2));

    // Predicted score range from tile composition
    const win = scoreWindow(g);

    const calcTimeMs = parseFloat(((performance.now() - t0).toFixed(3)));

    const result = {
      calcTimeMs,
      currentScore: s.score,
      bestScore: s.best,
      board: {
        size,
        mode: s.mode,
        tileCount,
        emptyCells,
        fullness: tileCount / totalCells,
        maxTile: maxT,
        sumTiles: sumT,
        uniqueValues: [...new Set(values)].sort((a, b) => a - b),
        valueDistribution: dist,
      },
      heuristics: {
        emptyBonus: emptyCells * W_EMPTY,
        smoothness,
        monotonicity: mono,
        maxCorner,
        singleCorner,
        mergeablePairs: mergeable,
        openLines,
        compositeScore: composite,
      },
    };

    console.log(
      `%c[dev] __evalPosition%c`,
      'font-weight:bold',
      '',
      `\n  Score: ${s.score} / Best: ${s.best}`,
      `\n  Board: ${size}x${size} | Tiles: ${tileCount} | Empty: ${emptyCells}`,
      `\n  Max tile: ${maxT} | Sum: ${sumT}`,
      `\n  Smoothness: ${smoothness.toFixed(2)} | Monotonicity: ${mono}`,
      `\n  Mergeable pairs: ${mergeable} | Open lines: ${openLines}`,
      `\n  Max in corner: ${maxCorner}`,
      `\n  Composite score: ${composite.toFixed(2)}`,
      `\n  Est. highest possible tile: ~${estHighestTile.toLocaleString()}`,
      `\n  Score window: [${win.min}, ${win.max}] (valid: ${s.score >= win.min && s.score <= win.max})`,
      `\n  Calc time: ${calcTimeMs}ms`,
    );

    return result;
  }

  /**
   * Run the AI engine AFK until the high score exceeds itself 3 consecutive times.
   *
   * Behavior:
   *   - Sets autoSpeed to 0 (no delay, maximum speed)
   *   - Uses current autoDepth and manipulate settings
   *   - Starts a new game if needed
   *   - Loops until best score has been beaten by at least 3x in a row
   *   - Reports progress and final stats
   *
   * This is fire-and-forget: it runs asynchronously and notifies via console.
   */
  async __afkHighScore(): Promise<void> {
    const s = this.session.state;
    const initialBest = s.best;
    const depth = this.data.settings.autoDepth;
    const manipulate = this.data.settings.rngManip;

    console.log(`[dev] __afkHighScore → starting AFK run`);
    console.log(`[dev]   depth=${depth}, manipulate=${manipulate}, initialBest=${initialBest}`);

    // Set zero delay for max speed
    const prevSpeed = this.data.settings.autoSpeed;
    this.data.settings.autoSpeed = 0;
    this.persist();
    this.popover.update({ autoSpeed: 0 });

    let exceedCount = 0;
    let currentBest = initialBest;
    let gamesPlayed = 0;
    const startTime = Date.now();

    // We run in a loop: play until game over, check if best exceeded 3x, repeat
    const loop = async () => {
      if (this.session.state.over || this.session.state.moveCount === 0) {
        this.newGame();
        gamesPlayed++;
      }

      // Start auto-play
      this.data.settings.autoOn = true;
      this.data.settings.autoDepth = depth;
      this.data.settings.rngManip = manipulate;
      this.startAuto();

      // Wait for the engine to finish (game over or stop)
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!this.autoOn || this.session.state.over) {
            resolve();
            return;
          }
          setTimeout(check, 100);
        };
        check();
      });

      const finishedBest = this.session.state.best;
      if (finishedBest > currentBest) {
        currentBest = finishedBest;
        exceedCount = 1;
        console.log(`[dev] __afkHighScore → new best: ${currentBest} (game #${gamesPlayed})`);
      } else if (finishedBest >= currentBest) {
        // Same best counts toward the 3x threshold
        exceedCount++;
        console.log(`[dev] __afkHighScore → best maintained: ${currentBest} (exceedCount=${exceedCount}/3)`);
      } else {
        // Score dropped below threshold — reset counter
        exceedCount = 0;
      }

      if (exceedCount >= 3) {
        // Done!
        this.stopAuto();
        this.data.settings.autoSpeed = prevSpeed;
        this.persist();
        this.popover.update({ autoSpeed: prevSpeed });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `%c[dev] __afkHighScore → DONE%c`,
          'font-weight:bold;color:#4ade80',
          '',
          `  Games played: ${gamesPlayed}`,
          `  Final best: ${currentBest}`,
          `  Time: ${elapsed}s`,
          `  Exceeded 3x threshold ✓`,
        );
        this.notify(`AFK High Score: ${currentBest} in ${elapsed}s`, Icons.engine);
        return;
      }

      // Continue: new game and loop
      if (!this.session.state.over) {
        this.newGame();
      }
      gamesPlayed++;
      setTimeout(loop, 0);
    };

    loop();
  }

  /**
   * Ensure the score correctly matches the latest position.
   * Recalculates the score window from the board tiles and clamps the
   * displayed score into the valid range. Updates UI and persists state.
   *
   * Returns the adjustment details.
   */
  __updateScore(): {
    from: number;
    to: number;
    min: number;
    max: number;
    changed: boolean;
    tileCount: number;
    scoreFromMerges: number;
  } {
    const s = this.session.state;
    const g = s.grid;
    const originalScore = s.score;

    // Use the validation window as the source of truth for score consistency
    const vr = validatePosition(g, s.score);
    const clamped = clampScoreToWindow(g, s.score);

    if (clamped.to !== clamped.from) {
      s.score = clamped.to;
      s.best = Math.max(s.best, clamped.to);
      this.clearPendingNew();
      this.saveCurrent();
      this.updateUI();
      console.log(`[dev] __updateScore -> score adjusted ${originalScore} → ${clamped.to} (window [${clamped.min}, ${clamped.max}])`);
    } else {
      console.log(`[dev] __updateScore -> score ${originalScore} already valid (window [${clamped.min}, ${clamped.max}])`);
    }

    return {
      from: originalScore,
      to: s.score,
      min: clamped.min,
      max: clamped.max,
      changed: clamped.to !== clamped.from,
      tileCount: vr.tileCount,
      scoreFromMerges: clamped.to,
    };
  }


  /** Print usage info for the developer console. */
  __help(): void {
    const lines = [
      '%c2048 Developer Console%c',
      'font-weight:bold;font-size:14px;',
      '',
      '__undo()                  Undo last move (no powerup cost)',
      '__undo(n)                 Undo n steps at once',
      '__undo(-n)                Enable engine for n moves',
      '__delete(row, col)        Remove tile at grid position',
      '__deleteValue(n)          Remove all tiles of value n',
      '__swap(r1, c1, r2, c2)   Swap two tiles',
      '__addTiles(n)             Spawn n free tiles (value 2)',
      '__add(val)                Place val at first empty cell',
      '__add(x, y)               Place a 2 at grid position',
      '__add(val, x, y)          Place val at (x, y); error if occupied',
      '__add(val, x, y, 1)       Place val at (x, y), replacing if needed',
      '__clear()                 Clear entire board',
      '__fill(val)               Fill board with tiles of value',
      '__score(n)                Set score to n',
      '__max(row, col, val)      Place tile of value at position',
      '__moves(n)                Set move count',
      '__cheat(dir)              Move without spawning (free experiment)',
      '__fillPowerups()          Max out all powerups',
      '__win()                   Instantly win (place 2048)',
      '__noDelay()               Start engine with zero delay (max speed)',
      '__nextNumber()            Peek next spawn value (2 or 4)',
      '__nextLocation()          Peek next spawn position',
      '__validate()              Check score vs tile window (valid?)',
      '__updatePosition()        Clamp score into the valid window',
      '__bypassValidation(vf?)   Remove minimal tiles to make position valid (vf=true: value-first)',
      '__getStats()              Full board/session/UI diagnostics dump',
      '__setBoard(vals?)         Set board from values grid or flat array',
      '__evalPosition()          Heuristic position evaluation & analysis',
      '__afkHighScore()          Auto-run AFK until best exceeds 3x',
      '__updateScore()           Ensure score matches current position',
      '__dev.log(fn, ms?)        Periodic logger — log a function every N ms',
      '__dev.stopLog(id?)        Stop a specific or all periodic loggers',
      '__dev.callNative(name, …) Call any built-in dev method by name',
      '__help()                  Show this message',
    ];
    console.log(...lines);
  }

  private recomputeOver(): void {
    this.session.state.over = !hasMoves(this.session.state.grid);
  }
}

/** Monotonic id counter for dev-console tile placement (avoids collisions). */
let _devId = 1;
function freshDevId(): number { return _devId++; }
