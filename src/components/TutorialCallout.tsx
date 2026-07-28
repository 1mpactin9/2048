// tutorial callout — shows the current step's guidance below the board

import { TUTORIAL_COPY, tutorialStep } from '../engine/tutorial';
import type { Gameplay } from '../engine/types';
import { Callout } from './Callout';

type Props = {
  gameplay: Gameplay;
};

export function TutorialCallout({ gameplay }: Props) {
  const step = tutorialStep(gameplay);
  const copy = TUTORIAL_COPY[step];
  return <Callout title={copy.title}>{copy.body}</Callout>;
}
