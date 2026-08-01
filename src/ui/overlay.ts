import { Icons } from "./icons";

export interface OverlayAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface OverlayOptions {
  title: string;
  titleClass?: string;
  message?: string;
  score?: number;
  danger?: boolean;
  actions: OverlayAction[];
}

export class Overlay {
  private el: HTMLElement | null = null;

  show(opts: OverlayOptions): void {
    this.close();
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const card = document.createElement("div");
    card.className =
      "overlay__card" + (opts.danger ? " overlay__card--danger" : "");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "overlay__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = Icons.close;
    closeBtn.addEventListener("click", () => this.close());
    card.appendChild(closeBtn);
    const title = document.createElement("div");
    title.className =
      "overlay__title" + (opts.titleClass ? ` ${opts.titleClass}` : "");
    title.textContent = opts.title;
    card.appendChild(title);
    if (opts.score !== undefined) {
      const sc = document.createElement("div");
      sc.className = "overlay__score";
      sc.textContent = String(opts.score);
      card.appendChild(sc);
    }
    if (opts.message) {
      const msg = document.createElement("div");
      msg.className = "overlay__msg";
      msg.textContent = opts.message;
      card.appendChild(msg);
    }
    const actWrap = document.createElement("div");
    actWrap.className = "overlay__actions";
    for (const a of opts.actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "btn" +
        (a.primary
          ? opts.danger
            ? " btn--danger"
            : " btn--primary"
          : " btn--ghost");
      b.textContent = a.label;
      b.addEventListener("click", () => a.onClick());
      actWrap.appendChild(b);
    }
    card.appendChild(actWrap);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.el = overlay;
  }

  close(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  get isOpen(): boolean {
    return this.el !== null;
  }
}
