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
} from "@/ui/theme";

describe("initTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    const existing = document.querySelector('meta[name="theme-color"]');
    if (existing) existing.remove();
  });

  it("sets root dataset.theme to resolved mode", () => {
    initTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets meta theme-color content", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
    initTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("system pref resolves to browser setting", () => {
    initTheme("system");
    expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
  });
});

describe("setThemePref", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("updates internal currentPref", () => {
    initTheme("light");
    setThemePref("dark");
    expect(currentThemePref()).toBe("dark");
  });

  it("applies to root dataset", () => {
    initTheme("light");
    setThemePref("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("toggleTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("cycles between light and dark", () => {
    initTheme("light");
    const next = toggleTheme();
    expect(next).toBe("dark");
    expect(currentResolved()).toBe("dark");

    const next2 = toggleTheme();
    expect(next2).toBe("light");
    expect(currentResolved()).toBe("light");
  });

  it("returns the new preference", () => {
    initTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(toggleTheme()).toBe("light");
  });
});

describe("currentResolved", () => {
  it("returns dark when pref is dark", () => {
    initTheme("dark");
    expect(currentResolved()).toBe("dark");
  });

  it("returns light when pref is light", () => {
    initTheme("light");
    expect(currentResolved()).toBe("light");
  });

  it("returns system preference when pref is system", () => {
    initTheme("system");
    expect(currentResolved()).toBe("light");
  });
});

describe("currentThemePref", () => {
  it("returns the internally tracked preference", () => {
    initTheme("dark");
    expect(currentThemePref()).toBe("dark");
    setThemePref("light");
    expect(currentThemePref()).toBe("light");
  });
});
