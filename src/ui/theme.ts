import type { ThemePref } from "../core/storage";

const root = document.documentElement;
const meta = document.querySelector('meta[name="theme-color"]');

let currentPref: ThemePref = "system";
let systemQuery: MediaQueryList | null = null;

function resolved(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

function apply(pref: ThemePref): void {
  currentPref = pref;
  const mode = resolved(pref);
  root.dataset.theme = mode;
  if (meta)
    meta.setAttribute("content", mode === "dark" ? "#16130f" : "#faf8ef");
}

export function initTheme(pref: ThemePref): void {
  systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemQuery.addEventListener("change", () => {
    if (currentPref === "system") apply("system");
  });
  apply(pref);
}

export function setThemePref(pref: ThemePref): void {
  apply(pref);
}

export function currentThemePref(): ThemePref {
  return currentPref;
}

/** Quick toggle used by the nav button: cycles light <-> dark. */
export function toggleTheme(): ThemePref {
  const next: ThemePref = resolved(currentPref) === "dark" ? "light" : "dark";
  apply(next);
  return next;
}

export function currentResolved(): "light" | "dark" {
  return resolved(currentPref);
}
