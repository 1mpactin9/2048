// prompt banner while a powerup is selecting its targets

import { Callout } from './Callout';
import { POWERUP_LABELS, SELECTION_PROMPTS } from './strings';
import type { Selection } from '../engine/types';

// which step of the selection are we on -> which prompt text
function currentPrompt(sel: Selection): string {
  const prompts = SELECTION_PROMPTS[sel.kind] as readonly string[];
  switch (sel.kind) {
    case 'tileAndEmptyCell':
      return sel.tile ? prompts[1] : prompts[0];
    case 'multipleTile':
      return (sel.tiles?.length ?? 0) === 0 ? prompts[0] : prompts[1];
    case 'adjacentTilesDirectional':
      return sel.origin ? prompts[1] : prompts[0];
    default:
      return prompts[0];
  }
}

type Props = {
  selection: Selection;
  onCancel: () => void;
};

export function SelectionCallout({ selection, onCancel }: Props) {
  return (
    <Callout
      title={POWERUP_LABELS[selection.powerup]}
      onCancel={onCancel}
      cancelLabel='Cancel'
    >
      {currentPrompt(selection)}
    </Callout>
  );
}
