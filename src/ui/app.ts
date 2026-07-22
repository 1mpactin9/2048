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
  private resumeBtn!: HTMLElement;
  private autoBtn!: HTMLElement;
  private themeBtn!: HTMLElement;
  private modeBadge!: HTMLElement;

  constructor() {
    this.data = load();
    this.size = this.data.settings.lastSize || DEFAULT_SIZE;
    this.mode = this.data.settings.lastMode || DEFAULT_MODE;
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

    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'icon-btn';
    autoBtn.setAttribute('aria-label', 'Auto-play');
    autoBtn.innerHTML = Icons.play;
    autoBtn.addEventListener('click', () => this.toggleAuto());

    const themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'icon-btn';
    themeBtn.setAttribute('aria-label', 'Toggle theme');
    themeBtn.innerHTML = currentResolved() === 'dark' ? Icons.sun : Icons.moon;
    themeBtn.addEventListener('click', () => this.onThemeToggle());

    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.className = 'btn btn--ghost';
    resumeBtn.textContent = 'Resume';
    resumeBtn.style.display = 'none';
    resumeBtn.addEventListener('click', () => this.resumeGame());

    const newGameBtn = document.createElement('button');
    newGameBtn.type = 'button';
    newGameBtn.className = 'btn btn--primary';
    newGameBtn.textContent = 'New Game';
    newGameBtn.addEventListener('click', () => this.confirmNewGame());

    actions.append(scores, autoBtn, themeBtn, resumeBtn, newGameBtn);
    topbar.append(left, actions);

    const shell = document.createElement('main');
    shell.className = 'app';

    // tagline
    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';
    const titleText = document.createElement('div');
    titleText.className = 'title-row__text';
    const h1 = document.createElement('h1');
    h1.textContent = 'Join the tiles, get to 2048!';
    const p = document.createElement('p');
    p.textContent = 'Arrow keys, WASD, or swipe to move.';
    titleText.append(h1, p);
    titleRow.append(titleText);

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

    const foot = document.createElement('footer');
    foot.className = 'foot';
    foot.textContent = 'A clean 2048 rewrite. Progress saves to your browser.';

    shell.append(titleRow, stage, foot);
    app.append(topbar, shell);

    this.resumeBtn = resumeBtn;
    this.autoBtn = autoBtn;
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
    box.className = 'score-box';
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
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = icon;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    const count = document.createElement('span');
    count.className = 'powerup-btn__count';
    count.textContent = '0';
    btn.append(iconSpan, labelSpan, count);
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
    this.updateResumeVisibility();
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
    this.updateResumeVisibility();
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
    this.updateResumeVisibility();
  }

  private resumeGame(): void {
    if (!this.pendingNew) return;
    const saved = getGame(this.data, this.size, this.mode);
    if (!saved || saved.over || saved.moveCount === 0) {
      this.pendingNew = false;
      this.updateResumeVisibility();
      return;
    }
    this.session = restoreSession(saved);
    this.pendingNew = false;
    this.board.fullRender(this.session.state.grid);
    this.updateUI();
    this.updateResumeVisibility();
  }

  private updateResumeVisibility(): void {
    const saved = getGame(this.data, this.size, this.mode);
    const show = this.pendingNew && !!saved && !saved.over && saved.moveCount > 0;
    this.resumeBtn.style.display = show ? '' : 'none';
  }

  // ---------- Powerups ----------
  private powerupUndo(): void {
    if (!this.session.canUndo) return;
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
    this.armed = 'swap';
    this.board.enterSelectMode(2, (cells) => {
      if (cells.length === 2) {
        this.session.swap(cells[0].row, cells[0].col, cells[1].row, cells[1].col);
        this.saveCurrent();
        this.board.fullRender(this.session.state.grid);
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
    this.scoreVal.textContent = String(s.score);
    this.bestVal.textContent = String(s.best);
    this.modeBadge.textContent = this.mode;

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

    this.autoBtn.classList.toggle('is-active', this.autoOn);
    this.autoBtn.innerHTML = this.autoOn ? Icons.spark : Icons.play;
  }

  private bumpScore(): void {
    this.scoreVal.classList.remove('is-bump');
    void this.scoreVal.offsetWidth; // restart animation
    this.scoreVal.classList.add('is-bump');
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
    const pref = toggleTheme();
    this.data.settings.theme = pref;
    this.persist();
    this.themeBtn.innerHTML = currentResolved() === 'dark' ? Icons.sun : Icons.moon;
    this.popover.update({ theme: pref });
  }

  private onThemePref(pref: 'light' | 'dark' | 'system'): void {
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
