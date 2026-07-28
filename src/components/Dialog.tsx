// reusable modal dialog — backdrop + spring-scaled card

import { AnimatePresence, motion } from 'motion/react';
import type { ComponentChildren } from 'preact';

type Props = {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children?: ComponentChildren;
  actions?: ComponentChildren;
};

export function Dialog({ open, onClose, title, children, actions }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div class='fixed inset-0 z-50 flex flex-col items-center justify-center'>
          <motion.div
            class='bg-near-black/70 absolute inset-0'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            class='bg-sand shadow-xl relative z-10 my-4 flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col overflow-hidden rounded-3xl'
            initial={{ opacity: 0, scale: 0.9, y: 300 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 300 }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
          >
            <div class='flex flex-col gap-6 overflow-y-auto p-6 text-center md:p-8'>
              {title && (
                <h1 class='text-2xl font-semibold md:text-4xl md:font-medium'>{title}</h1>
              )}
              {children}
              {actions && <div class='actions-grid mx-auto w-full md:max-w-96'>{actions}</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
