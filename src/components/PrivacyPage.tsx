// privacy policy page (abbreviated)

import { DocPage } from './DocPage';

type Props = { onBack: () => void };

export function PrivacyPage({ onBack }: Props) {
  return (
    <DocPage onBack={onBack}>
      <h2>Privacy Policy</h2>
      <p>
        This game stores your game progress and best score locally in your browser using
        localStorage. This data never leaves your device and is not transmitted to any
        server.
      </p>
      <p>
        No personal information is collected, and no tracking or advertising cookies are
        used in this build.
      </p>
      <p>
        If you have any questions about privacy, contact{' '}
        <a href='mailto:feedback@play2048.co'>feedback@play2048.co</a>.
      </p>
    </DocPage>
  );
}
