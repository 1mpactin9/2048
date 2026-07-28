// troubleshooting page

import { DocPage } from './DocPage';

type Props = { onBack: () => void };

const ISSUES: { q: string; a: string }[] = [
  {
    q: "Tiles don't show up on screen",
    a: 'This is usually caused by hardware acceleration being disabled. In Chrome, Brave, or Arc, go to Settings → System and enable "Use hardware acceleration when available", then restart the browser. You can check GPU status at chrome://gpu.',
  },
  {
    q: "Numbers don't show up on the tiles",
    a: 'In Firefox, this can happen when a font fails to load. Try refreshing the page or clearing the cache.',
  },
  {
    q: 'The tiles are transparent or the board looks broken',
    a: 'In Safari, enable WebGL under Develop → Experimental Features, or update to the latest version of Safari.',
  },
  {
    q: 'Other issue not listed here?',
    a: 'Please let us know at feedback@play2048.co and include your browser and device details.',
  },
];

export function TroubleshootingPage({ onBack }: Props) {
  return (
    <DocPage onBack={onBack}>
      <h2>Troubleshooting</h2>
      <p>Having trouble playing? Here are solutions to the most common issues.</p>
      {ISSUES.map((issue) => (
        <details key={issue.q} class='border-leather/50 mt-4 border-t pt-4'>
          <summary class='cursor-pointer font-medium'>{issue.q}</summary>
          <p>{issue.a}</p>
        </details>
      ))}
    </DocPage>
  );
}
