export interface ScoreAnimation {
  force?: boolean;
  dir?: "down" | "up";
}

const REEL_DURATION_MS = 420;

export function bumpScore(el: HTMLElement): void {
  el.classList.remove("is-bump");
  void el.offsetWidth;
  el.classList.add("is-bump");
}

export function setScore(
  el: HTMLElement,
  value: number,
  prev: number,
  anim?: ScoreAnimation,
): void {
  const text = String(value);
  if (anim?.force) {
    scrollScoreTo(el, text, anim.dir ?? "down");
  } else if (value < prev) {
    scrollScoreTo(el, text, "down");
  } else {
    el.textContent = text;
  }
}

export function scrollScoreTo(
  el: HTMLElement,
  text: string,
  dir: "down" | "up",
): void {
  const prev = el.textContent ?? "";
  el.textContent = "";
  const reel = document.createElement("span");
  reel.className = "score-reel";
  const top = document.createElement("span");
  const bottom = document.createElement("span");
  if (dir === "down") {
    top.textContent = prev;
    bottom.textContent = text;
    reel.style.transform = "translateY(0)";
  } else {
    top.textContent = text;
    bottom.textContent = prev;
    reel.style.transform = "translateY(-50%)";
  }
  reel.append(top, bottom);
  el.appendChild(reel);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      reel.style.transform =
        dir === "down" ? "translateY(-50%)" : "translateY(0)";
    }),
  );
  window.setTimeout(() => {
    if (el.firstElementChild === reel) el.textContent = text;
  }, REEL_DURATION_MS);
}

export function animateModeBadge(badge: HTMLElement, newMode: string): void {
  const oldText = badge.textContent ?? "";
  if (oldText === newMode) return;
  badge.classList.add("mode-badge--fading");
  void badge.offsetWidth;
  setTimeout(() => {
    badge.textContent = newMode;
    badge.classList.remove("mode-badge--fading");
  }, 120);
  setTimeout(() => {
    badge.style.width = "";
  }, 240);
}
