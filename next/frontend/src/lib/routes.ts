import type { Component } from "svelte";
import Standard from "./pages/Standard.svelte";
import Classic from "./pages/Classic.svelte";
import Plus from "./pages/Plus.svelte";
import Learn from "./pages/Learn.svelte";
import About from "./pages/About.svelte";

export const routes: Record<string, Component> = {
  "/": Standard,
  "/classic": Classic,
  "/plus": Plus,
  "/learn": Learn,
  "/about": About,
  "*": Standard,
};