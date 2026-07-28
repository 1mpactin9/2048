// right-side sliding menu drawer — mode switch + info links

import { AnimatePresence, motion } from 'motion/react';
import { GameMode } from '../engine/types';

type Props = {
  open: boolean;
  currentMode: GameMode;
  onClose: () => void;
  onNavigate: (path: string) => void;
};

const MODE_ITEMS: { path: string; mode: GameMode; label: string; subtitle: string }[] = [
  { path: '/', mode: GameMode.Standard, label: 'Standard', subtitle: '2048 with powerups' },
  { path: '/classic', mode: GameMode.Classic, label: 'Classic', subtitle: 'The original 2048, no undo' },
  { path: '/tutorial', mode: GameMode.Tutorial, label: 'Tutorial', subtitle: 'Learn how to play 2048' },
];

const INFO_ITEMS: { path: string; label: string }[] = [
  { path: '/about', label: 'About' },
  { path: '/troubleshooting', label: 'Game not working?' },
  { path: '/privacy-policy', label: 'Privacy Policy' },
];

export function Menu({ open, currentMode, onClose, onNavigate }: Props) {
  const go = (path: string) => {
    onNavigate(path);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            class='fixed inset-0 z-50 bg-near-black/30'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.nav
            class='bg-off-white fixed top-0 right-0 z-50 flex h-full w-72 max-w-[85vw] flex-col gap-2 overflow-y-auto p-4 shadow-xl'
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          >
            <ul class='flex flex-col'>
              {MODE_ITEMS.map((item) => (
                <li key={item.path}>
                  <button
                    class={`group flex w-full gap-2 rounded-md p-2 text-left transition-colors hover:bg-tan hover:text-white ${
                      item.mode === currentMode ? 'bg-tan/70 text-white' : ''
                    }`}
                    onClick={() => go(item.path)}
                  >
                    <span class='flex flex-col'>
                      <span class='font-medium'>{item.label}</span>
                      <span class='text-xs opacity-70'>{item.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <hr class='border-leather/50 mx-2 border-t' />
            <ul class='flex flex-col'>
              {INFO_ITEMS.map((item) => (
                <li key={item.path}>
                  <button
                    class='flex w-full rounded-md p-2 text-left transition-colors hover:bg-beige'
                    onClick={() => go(item.path)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
