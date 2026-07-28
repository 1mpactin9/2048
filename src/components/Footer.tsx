// copyright footer

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <div class='short:hidden shrink-0 text-center text-xs opacity-50'>
      play2048.co © 2014—{year} Gabriele Cirulli. All rights reserved.
    </div>
  );
}
