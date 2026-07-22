import type { ThemePref } from '../core/storage';
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
): { el: HTMLElement; setActive: (value: string) => void } {
  const el = document.createElement('div');
  el.className = 'segmented';
  const buttons = new Map<string, HTMLElement>();

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented__btn';
    btn.textContent = opt.label;
    if (opt.value === active) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      onChange(opt.value);
    });
    buttons.set(opt.value, btn);
    el.appendChild(btn);
  }

  const setActive = (value: string) => {
    for (const [v, b] of buttons) b.classList.toggle('is-active', v === value);
  };

  return { el, setActive };
}

export interface PopoverOpts {
  theme: ThemePref;
  autoOn: boolean;
  onTheme: (pref: ThemePref) => void;
  onAuto: (on: boolean) => void;
  onClearAll: () => void;
}

/** The settings (gear) button + dropdown popover. */
export class SettingsPopover {
  readonly el: HTMLElement;
  private popover: HTMLElement;
  private autoSwitch!: HTMLElement;
  private themeSeg!: { el: HTMLElement; setActive: (v: string) => void };
  private open = false;
  private opts: PopoverOpts;

  constructor(opts: PopoverOpts) {
    this.opts = opts;
    const wrap = document.createElement('div');
    wrap.className = 'popover-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', 'Settings');
    btn.innerHTML = Icons.settings;

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

    const divider = document.createElement('div');
    divider.className = 'popover__divider';

    const danger = document.createElement('button');
    danger.type = 'button';
    danger.className = 'popover__danger';
    danger.textContent = 'Clear all progress';
    danger.addEventListener('click', () => this.opts.onClearAll());

    this.popover.append(themeGroup, autoRow, divider, danger);
  }

  toggle(): void {
    this.open ? this.close() : this.openPopover();
  }

  private openPopover(): void {
    this.open = true;
    this.popover.hidden = false;
  }

  close(): void {
    this.open = false;
    this.popover.hidden = true;
  }

  update(opts: Partial<PopoverOpts>): void {
    Object.assign(this.opts, opts);
    if (opts.theme !== undefined) this.themeSeg.setActive(opts.theme);
    if (opts.autoOn !== undefined) {
      this.autoSwitch.classList.toggle('is-on', opts.autoOn);
      this.autoSwitch.setAttribute('aria-pressed', String(opts.autoOn));
    }
  }
}
