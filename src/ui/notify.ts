/**
 * Small, auto-hiding top-right notification stack. Visually a scaled-down
 * cousin of the overlay/modal (same rounded-card language) but non-blocking:
 * it never darkens the board or waits for a click. Used sparingly - only to
 * tell the player what the engine just did on its own (e.g. spent a
 * power-up), since that's the one moment a silent auto-played move could be
 * confusing.
 */
export interface NotifyOptions {
  /** How long the card stays up, in ms, before it auto-hides. */
  duration?: number;
  /** Inline SVG icon shown at the start of the card. */
  icon?: string;
}

export class NotificationCenter {
  private stack: HTMLElement;

  constructor(parent: HTMLElement = document.body) {
    this.stack = document.createElement("div");
    this.stack.className = "notify-stack";
    parent.appendChild(this.stack);
  }

  show(message: string, opts: NotifyOptions = {}): void {
    const duration = opts.duration ?? 3000;

    const card = document.createElement("div");
    card.className = "notify-card";
    card.setAttribute("role", "status");

    if (opts.icon) {
      const icon = document.createElement("span");
      icon.className = "notify-card__icon";
      icon.innerHTML = opts.icon;
      card.appendChild(icon);
    }

    const text = document.createElement("span");
    text.className = "notify-card__text";
    text.textContent = message;
    card.appendChild(text);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "notify-card__close";
    closeBtn.setAttribute("aria-label", "Dismiss");
    closeBtn.innerHTML = "&times;";
    card.appendChild(closeBtn);

    const bar = document.createElement("div");
    bar.className = "notify-card__bar";
    const fill = document.createElement("div");
    fill.className = "notify-card__bar-fill";
    bar.appendChild(fill);
    card.appendChild(bar);

    this.stack.appendChild(card);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      card.classList.remove("is-visible");
      card.classList.add("is-leaving");
      setTimeout(() => card.remove(), 200);
    };

    closeBtn.addEventListener("click", dismiss);

    // Enter animation, then start the depleting progress bar.
    requestAnimationFrame(() => {
      card.classList.add("is-visible");
      fill.style.transitionDuration = `${duration}ms`;
      requestAnimationFrame(() => {
        fill.style.transform = "scaleX(0)";
      });
    });

    const timer = setTimeout(dismiss, duration);
  }
}
