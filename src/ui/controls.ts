import type { ThemePref } from '../core/storage';
import { SIZES } from '../core/constants';
import { Icons } from './icons';

export interface SegOption {
  label: string;
  value: string;
}

/** Build a segmented toggle/radio group. Returns the element and an updater. */
export function createSegmented(
  options: SegOption[],
  active: string,
  onChange: (value: string) => void,
): { el: HTMLElement; setActive: (value: string) => void; layout: () => void } {
  const el = document.createElement('div');
  el.className = 'segmented';

  const thumb = document.createElement('div');
  thumb.className = 'segmented__thumb';
  el.appendChild(thumb);

  const buttons = new Map<string, HTMLElement>();

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented__btn';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      onChange(opt.value);
    });
    buttons.set(opt.value, btn);
    el.appendChild(btn);
  }

  // Position the sliding thumb over the active button. When `animate` is false
  // the move is committed without a transition (used on first layout / open so
  // the thumb doesn't slide in from the edge).
  const position = (animate: boolean) => {
    let activeBtn: HTMLElement | undefined;
    for (const b of buttons.values()) {
      if (b.classList.contains('is-active')) {
        activeBtn = b;
        break;
      }
    }
    if (!activeBtn) return;
    if (!animate) el.classList.remove('segmented--ready');
    thumb.style.width = `${activeBtn.offsetWidth}px`;
    thumb.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
    if (!animate) {
      void thumb.offsetWidth; // commit the move before re-enabling transitions
      el.classList.add('segmented--ready');
    }
  };

  const setActive = (value: string) => {
    for (const [v, b] of buttons) b.classList.toggle('is-active', v === value);
    position(true);
  };

  const layout = () => position(false);

  setActive(active);
  return { el, setActive, layout };
}

export interface PopoverOpts {
  theme: ThemePref;
  autoOn: boolean;
  autoSpeed: number;
  autoDepth: number;
  autoPowerups: boolean;
  mode: 'standard' | 'classic';
  size: number;
  onTheme: (pref: ThemePref) => void;
  onAuto: (on: boolean) => void;
  onAutoSpeed: (ms: number) => void;
  onAutoDepth: (depth: number) => void;
  onAutoPowerups: (on: boolean) => void;
  onMode: (mode: 'standard' | 'classic') => void;
  onSize: (size: number) => void;
  onClearAll: () => void;
}

/** The settings (gear) button + dropdown popover. */
export class SettingsPopover {
  readonly el: HTMLElement;
  private popover: HTMLElement;
  private autoSwitch!: HTMLElement;
  private powerupSwitch!: HTMLElement;
  private themeSeg!: { el: HTMLElement; setActive: (v: string) => void; layout: () => void };
  private modeSeg!: { el: HTMLElement; setActive: (v: string) => void; layout: () => void };
  private sizeSeg!: { el: HTMLElement; setActive: (v: string) => void; layout: () => void };
  private depthSeg!: { el: HTMLElement; setActive: (v: string) => void; layout: () => void };
  private delaySeg!: { el: HTMLElement; setActive: (v: string) => void; layout: () => void };
  private open = false;
  private opts: PopoverOpts;

  constructor(opts: PopoverOpts) {
    this.opts = opts;
    const wrap = document.createElement('div');
    wrap.className = 'popover-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', 'Menu');
    btn.innerHTML = Icons.menu;

    this.popover = document.createElement('div');
    this.popover.className = 'popover';
    this.popover.hidden = true;
    this.buildContent();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    document.addEventListener('click', (e) => {
      if (this.open && !wrap.contains(e.target as Node)) this.close();
    });

    wrap.append(btn, this.popover);
    this.el = wrap;
  }

  private buildContent(): void {
    this.popover.innerHTML = '';

    // Game section: mode + size
    const gameGroup = document.createElement('div');
    gameGroup.className = 'popover__group';

    const modeLabel = document.createElement('div');
    modeLabel.className = 'popover__label';
    modeLabel.textContent = 'Game';

    this.modeSeg = createSegmented(
      [
        { label: 'Standard', value: 'standard' },
        { label: 'Classic', value: 'classic' },
      ],
      this.opts.mode,
      (v) => this.opts.onMode(v as 'standard' | 'classic'),
    );

    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'popover__label';
    sizeLabel.textContent = 'Board Size';

    this.sizeSeg = createSegmented(
      SIZES.map((s) => ({ label: `${s}×${s}`, value: String(s) })),
      String(this.opts.size),
      (v) => this.opts.onSize(Number(v)),
    );

    gameGroup.append(modeLabel, this.modeSeg.el);

    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'popover__group';
    sizeGroup.append(sizeLabel, this.sizeSeg.el);

    const dividerGameSize = document.createElement('div');
    dividerGameSize.className = 'popover__divider';

    const divider1 = document.createElement('div');
    divider1.className = 'popover__divider';

    // Theme section
    const themeGroup = document.createElement('div');
    themeGroup.className = 'popover__group';
    const themeLabel = document.createElement('div');
    themeLabel.className = 'popover__label';
    themeLabel.textContent = 'Theme';
    this.themeSeg = createSegmented(
      [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'System', value: 'system' },
      ],
      this.opts.theme,
      (v) => this.opts.onTheme(v as ThemePref),
    );
    themeGroup.append(themeLabel, this.themeSeg.el);

    const dividerThemeAuto = document.createElement('div');
    dividerThemeAuto.className = 'popover__divider';

    const autoRow = document.createElement('div');
    autoRow.className = 'popover__row';
    const autoLabel = document.createElement('span');
    autoLabel.textContent = 'Auto-play';
    autoLabel.style.fontWeight = '600';
    autoLabel.style.fontSize = '13px';
    const autoSwitch = document.createElement('button');
    autoSwitch.type = 'button';
    autoSwitch.className = 'switch' + (this.opts.autoOn ? ' is-on' : '');
    autoSwitch.setAttribute('aria-label', 'Toggle auto-play');
    autoSwitch.setAttribute('aria-pressed', String(this.opts.autoOn));
    autoSwitch.addEventListener('click', () => this.opts.onAuto(!this.opts.autoOn));
    this.autoSwitch = autoSwitch;
    autoRow.append(autoLabel, autoSwitch);

    // Auto-play tuning: AI search depth, move delay, and whether the AI may
    // spend power-ups. Each writes straight to the settings the loop reads, so
    // changes take effect on the next tick (no restart needed).
    const autoOptsGroup = document.createElement('div');
    autoOptsGroup.className = 'popover__group';

    const depthLabel = document.createElement('div');
    depthLabel.className = 'popover__label';
    depthLabel.textContent = 'AI Depth';
    this.depthSeg = createSegmented(
      [
        { label: 'Auto', value: '0' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
        { label: '5', value: '5' },
      ],
      String(this.opts.autoDepth),
      (v) => this.opts.onAutoDepth(Number(v)),
    );

    const delayLabel = document.createElement('div');
    delayLabel.className = 'popover__label';
    delayLabel.textContent = 'Move Delay';
    this.delaySeg = createSegmented(
      [
        { label: 'Fast', value: '80' },
        { label: 'Normal', value: '180' },
        { label: 'Slow', value: '350' },
      ],
      String(this.opts.autoSpeed),
      (v) => this.opts.onAutoSpeed(Number(v)),
    );

    const powerupRow = document.createElement('div');
    powerupRow.className = 'popover__row';
    const powerupLabel = document.createElement('span');
    powerupLabel.textContent = 'Use power-ups';
    powerupLabel.style.fontWeight = '600';
    powerupLabel.style.fontSize = '13px';
    const powerupSwitch = document.createElement('button');
    powerupSwitch.type = 'button';
    powerupSwitch.className = 'switch' + (this.opts.autoPowerups ? ' is-on' : '');
    powerupSwitch.setAttribute('aria-label', 'Toggle AI power-ups');
    powerupSwitch.setAttribute('aria-pressed', String(this.opts.autoPowerups));
    powerupSwitch.addEventListener('click', () => this.opts.onAutoPowerups(!this.opts.autoPowerups));
    this.powerupSwitch = powerupSwitch;
    powerupRow.append(powerupLabel, powerupSwitch);

    autoOptsGroup.append(depthLabel, this.depthSeg.el, delayLabel, this.delaySeg.el, powerupRow);

    const divider2 = document.createElement('div');
    divider2.className = 'popover__divider';

    const danger = document.createElement('button');
    danger.type = 'button';
    danger.className = 'popover__danger';
    danger.textContent = 'Clear all progress';
    danger.addEventListener('click', () => this.opts.onClearAll());

    this.popover.append(
      gameGroup,
      dividerGameSize,
      sizeGroup,
      divider1,
      themeGroup,
      dividerThemeAuto,
      autoRow,
      autoOptsGroup,
      divider2,
      danger,
    );
  }

  toggle(): void {
    this.open ? this.close() : this.openPopover();
  }

  private openPopover(): void {
    this.open = true;
    this.popover.hidden = false;
    requestAnimationFrame(() => this.layoutThumbs());
  }

  private layoutThumbs(): void {
    this.modeSeg.layout();
    this.sizeSeg.layout();
    this.themeSeg.layout();
    this.depthSeg.layout();
    this.delaySeg.layout();
  }

  close(): void {
    this.open = false;
    this.popover.hidden = true;
  }

  update(opts: Partial<PopoverOpts>): void {
    Object.assign(this.opts, opts);
    if (opts.theme !== undefined) this.themeSeg.setActive(opts.theme);
    if (opts.mode !== undefined) this.modeSeg.setActive(opts.mode);
    if (opts.size !== undefined) this.sizeSeg.setActive(String(opts.size));
    if (opts.autoOn !== undefined) {
      this.autoSwitch.classList.toggle('is-on', opts.autoOn);
      this.autoSwitch.setAttribute('aria-pressed', String(opts.autoOn));
    }
    if (opts.autoDepth !== undefined) this.depthSeg.setActive(String(opts.autoDepth));
    if (opts.autoSpeed !== undefined) this.delaySeg.setActive(String(opts.autoSpeed));
    if (opts.autoPowerups !== undefined) {
      this.powerupSwitch.classList.toggle('is-on', opts.autoPowerups);
      this.powerupSwitch.setAttribute('aria-pressed', String(opts.autoPowerups));
    }
  }
}
