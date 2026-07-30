import type { Theme } from "../types/game";

let mediaQuery: MediaQueryList | null = null;
let listener: ((e: MediaQueryListEvent) => void) | null = null;

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolve(theme));

  if (mediaQuery && listener) {
    mediaQuery.removeEventListener("change", listener);
    listener = null;
  }

  if (theme === "system" && typeof window !== "undefined") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    listener = () => {
      document.documentElement.setAttribute("data-theme", resolve("system"));
    };
    mediaQuery.addEventListener("change", listener);
  }
}