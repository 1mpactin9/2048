// app shell — routing + mount

import { useCallback } from 'preact/hooks';
import { GameMode } from './engine/types';
import { useRouter } from './hooks/useRouter';
import { Game } from './components/Game';
import { AboutPage } from './components/AboutPage';
import { PrivacyPage } from './components/PrivacyPage';
import { TroubleshootingPage } from './components/TroubleshootingPage';

// route path -> game mode or page name
function routeKey(path: string): string {
  const p = path.replace(/\/$/, '') || '/';
  if (p === '/') return 'standard';
  if (p === '/classic') return 'classic';
  if (p === '/tutorial') return 'tutorial';
  return p.slice(1); // /about, /privacy-policy, /troubleshooting
}

export function App() {
  const { path, navigate } = useRouter();
  const key = routeKey(path);

  const onBack = useCallback(() => navigate('/'), [navigate]);

  const gameMode =
    key === 'standard'
      ? GameMode.Standard
      : key === 'classic'
        ? GameMode.Classic
        : key === 'tutorial'
          ? GameMode.Tutorial
          : null;

  // game screens remount on mode change via the key prop
  if (gameMode) {
    return <Game key={key} mode={gameMode} onNavigate={navigate} />;
  }

  switch (key) {
    case 'about':
      return <AboutPage onBack={onBack} />;
    case 'privacy-policy':
      return <PrivacyPage onBack={onBack} />;
    case 'troubleshooting':
      return <TroubleshootingPage onBack={onBack} />;
    default:
      return <Game key='standard' mode={GameMode.Standard} onNavigate={navigate} />;
  }
}
