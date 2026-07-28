// shared layout for static doc pages (about / privacy / troubleshooting)

import type { ComponentChildren } from 'preact';

type Props = {
  onBack: () => void;
  children: ComponentChildren;
};

export function DocPage({ onBack, children }: Props) {
  return (
    <div class='mx-auto w-full max-w-screen-md flex-1 overflow-y-auto px-4 py-6 sm:px-8'>
      <button class='mb-4 text-sm font-medium text-64-red hover:underline' onClick={onBack}>
        ← Back to game
      </button>
      <div class='document-content flex flex-col'>{children}</div>
    </div>
  );
}
