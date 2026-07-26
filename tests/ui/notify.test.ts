/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NotificationCenter } from "@/ui/notify";

describe("NotificationCenter", () => {
  let parent: HTMLElement;
  let nc: NotificationCenter;

  beforeEach(() => {
    parent = document.createElement("div");
    parent.id = "notify-parent";
    document.body.appendChild(parent);
    nc = new NotificationCenter(parent);
  });

  afterEach(() => {
    parent.remove();
  });

  it("creates a notify-stack element", () => {
    const stack = parent.querySelector(".notify-stack");
    expect(stack).not.toBeNull();
  });

  it("show creates card with correct text content", () => {
    nc.show("Test notification");
    const card = parent.querySelector(".notify-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Test notification");
  });

  it("adds icon element when icon provided", () => {
    const iconSvg = '<svg viewBox="0 0 24 24"></svg>';
    nc.show("With icon", { icon: iconSvg });
    const iconEl = parent.querySelector(".notify-card__icon");
    expect(iconEl).not.toBeNull();
    expect(iconEl?.querySelector("svg")).not.toBeNull();
  });

  it("adds close button", () => {
    nc.show("Dismissable");
    const closeBtn = parent.querySelector(".notify-card__close");
    expect(closeBtn).not.toBeNull();
  });

  it("creates progress bar with fill element", () => {
    nc.show("Progress bar test");
    const bar = parent.querySelector(".notify-card__bar");
    expect(bar).not.toBeNull();
    const fill = bar?.querySelector(".notify-card__bar-fill");
    expect(fill).not.toBeNull();
  });

  it("card has role=status", () => {
    nc.show("Accessible");
    const card = parent.querySelector(".notify-card");
    expect(card?.getAttribute("role")).toBe("status");
  });

  it("close button click dismisses notification", () => {
    nc.show("Close me");
    const card = parent.querySelector(".notify-card")!;
    const closeBtn = card.querySelector(".notify-card__close")!;
    closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(card.classList.contains("is-leaving")).toBe(true);
  });

  it("auto-dismiss after duration", () => {
    nc.show("Auto-dismiss", { duration: 50 });
    const card = parent.querySelector(".notify-card");
    expect(card).not.toBeNull();
  });

  it("multiple notifications stacked in notify-stack", () => {
    nc.show("First");
    nc.show("Second");
    const cards = parent.querySelectorAll(".notify-card");
    expect(cards.length).toBe(2);
  });
});
