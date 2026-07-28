// small callout banner shown below the board (tutorial + powerup selection)

import { motion } from 'motion/react';
import type { ComponentChildren } from 'preact';

type Props = {
  title?: string;
  children?: ComponentChildren;
  onCancel?: () => void;
  cancelLabel?: string;
};

export function Callout({ title, children, onCancel, cancelLabel }: Props) {
  return (
    <motion.div
      class='bg-sand shadow-button mx-auto flex max-w-md flex-col items-center gap-1 rounded-2xl px-5 py-3 text-center'
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
    >
      {title && <span class='font-semibold'>{title}</span>}
      {children && <span class='text-sm text-tan'>{children}</span>}
      {onCancel && (
        <button class='mt-1 text-sm font-medium text-64-red underline' onClick={onCancel}>
          {cancelLabel ?? 'Cancel'}
        </button>
      )}
    </motion.div>
  );
}
