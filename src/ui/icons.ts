// Inline SVG icons (stroke = currentColor). Kept minimal and dependency-free.

const svg = (inner: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

export const Icons = {
  undo:
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 32 32"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 25h6.5a8.5 8.5 0 0 0 8.5-8.5v0A8.5 8.5 0 0 0 16.5 8H8m0 0 3.5-4M8 8l3.5 4"></path></svg>',
  swap:
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 32 32"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9h.53a4 4 0 0 1 3.96 3.434L23 16m0 0 3.5-3.5M23 16l-4-2"></path><path fill="currentColor" fill-rule="evenodd" d="M16.006 25.23A4 4 0 0 0 20 29h5a4 4 0 0 0 4-4v-5a4 4 0 0 0-2.19-3.568l-1.689 1.69a3 3 0 0 1-3.463.561l-3.939-1.97A4 4 0 0 0 16 20v.764c.614.55 1 1.347 1 2.236 0 .885-.384 1.681-.994 2.23" clip-rule="evenodd"></path><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 23h-.53a4 4 0 0 1-3.96-3.434L9 16m0 0-3.5 3.5M9 16l4 2"></path><path fill="currentColor" fill-rule="evenodd" d="M3 7a4 4 0 0 1 4-4h5a4 4 0 0 1 3.993 3.77A3 3 0 0 0 15 9a3 3 0 0 0 1 2.236V12c0 1.361-.68 2.564-1.72 3.286l-3.938-1.97a3 3 0 0 0-3.463.563l-1.69 1.689A4 4 0 0 1 3 12z" clip-rule="evenodd"></path></svg>',
  delete:
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 32 32"><rect width="12" height="12" x="15" y="15" fill="currentColor" rx="4" transform="rotate(180 15 15)"></rect><rect width="9.5" height="9.5" x="13.75" y="27.75" stroke="currentColor" stroke-linecap="round" stroke-width="2.5" rx="2.75" transform="rotate(180 13.75 27.75)"></rect><rect width="9.5" height="9.5" x="27.75" y="13.75" stroke="currentColor" stroke-linecap="round" stroke-width="2.5" rx="2.75" transform="rotate(180 27.75 13.75)"></rect><rect width="12" height="12" x="29" y="29" fill="currentColor" rx="4" transform="rotate(180 29 29)"></rect></svg>',
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  ),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ),
  play: svg('<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  spark: svg(
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  ),
  snow: svg('<path d="M12 2v20M3.5 7l17 10M3.5 17l17-10"/>'),
  dice: svg(
    '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>',
  ),
  bolt: svg('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" stroke="none"/>'),
};
