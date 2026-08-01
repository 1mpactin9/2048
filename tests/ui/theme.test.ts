/// <reference types="vitest" />
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  () =>
    ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList,
);

import {
  initTheme,
  setThemePref,
  toggleTheme,
  currentResolved,
  currentThemePref,
} from "../../src/ui/theme";

describe("theme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("initTheme applies the resolved mode to documentElement", () => {
    initTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("setThemePref updates internal pref and applies to DOM", () => {
    initTheme("light");
    setThemePref("dark");
    expect(currentThemePref()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("toggleTheme cycles between light and dark", () => {
    initTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(currentResolved()).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(currentResolved()).toBe("light");
  });

  it("system pref resolves to either light or dark", () => {
    initTheme("system");
    expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
  });
});
