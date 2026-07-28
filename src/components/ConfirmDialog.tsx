// "start a new game?" confirmation

import { Dialog } from './Dialog';

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title='New Game'
      actions={
        <>
          <button
            class='rounded-xl bg-tan px-4 py-3 font-bold text-white shadow-button transition-colors hover:bg-brown'
            onClick={onConfirm}
          >
            Start New Game
          </button>
          <button
            class='rounded-xl border-2 border-sand bg-off-white px-4 py-3 font-bold text-tan shadow-button'
            onClick={onCancel}
          >
            Cancel
          </button>
        </>
      }
    >
      <p>Are you sure you want to start a new game? All progress will be lost.</p>
    </Dialog>
  );
}
