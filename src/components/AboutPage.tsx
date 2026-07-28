// about page

import { DocPage } from './DocPage';

type Props = { onBack: () => void };

export function AboutPage({ onBack }: Props) {
  return (
    <DocPage onBack={onBack}>
      <h2>About 2048</h2>
      <p>
        2048 is a puzzle game where you slide numbered tiles on a 4×4 grid to combine them
        and create a tile with the number 2048. The game was originally created by Gabriele
        Cirulli and launched on March 9, 2014, as an open-source project.
      </p>
      <p>
        This version is a modern rebuild of the original game, featuring powerups, a dark
        board, and enhanced visuals while preserving the classic gameplay loved by millions.
      </p>
      <p>
        <a href='mailto:feedback@play2048.co'>Contact us</a> — we'd love to hear from you.
      </p>
      <h3>History</h3>
      <p>
        2048 is a single-player sliding block puzzle game. The original was written in
        JavaScript and CSS over a weekend. It went viral, garnering millions of players
        worldwide and spawning countless clones across every platform.
      </p>
      <p>
        This 10th-anniversary edition was rebuilt from the ground up with modern web
        technologies. The game is not currently open-source.
      </p>
      <h3>Attribution</h3>
      <p>
        2048 was inspired by <a href='https://apps.apple.com/us/app/1024/id823499224'>1024</a> by
        Veewo Studio and <a href='https://threesgame.com'>Threes</a> by Asher Vollmer.
      </p>
    </DocPage>
  );
}