// the playable game screen — board, header, powerups, input, overlays

import { useCallback, useMemo, useState } from 'preact/hooks';
import { useGame } from '../hooks/useGame';
import { useInput } from '../hooks/useInput';
import { MODE_POWERUPS } from '../engine/constants';
import {
  BoardTheme,
  GameMode,
  GameState,
  Powerup,
  RotationDirection,
} from '../engine/types';
import type { Position, Tile } from '../engine/types';
import { Header } from './Header';
import { GameBoard } from './GameBoard';
import { PowerupBar } from './PowerupBar';
import { GameEndOverlay } from './GameEndOverlay';
import { ConfirmDialog } from './ConfirmDialog';
import { Menu } from './Menu';
import { SelectionCallout } from './SelectionCallout';
import { TutorialCallout } from './TutorialCallout';
import { Footer } from './Footer';

type Props = {
  mode: GameMode;
  onNavigate: (path: string) => void;
};

export function Game({ mode, onNavigate }: Props) {
  const game = useGame(mode);
  const { gameplay, best } = game;
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dark = mode === GameMode.Standard;
  const selecting = gameplay.state === GameState.Selecting;
  const selection = gameplay.selection;
  const powerupList = MODE_POWERUPS[mode];

  // new game: confirm unless already ended
  const requestNewGame = useCallback(() => {
    if (gameplay.state === GameState.GameOver || gameplay.state === GameState.Fresh) {
      game.newGame();
    } else {
      setConfirmOpen(true);
    }
  }, [gameplay.state, game]);

  const confirmNewGame = useCallback(() => {
    setConfirmOpen(false);
    game.newGame();
  }, [game]);

  // powerup activation by keyboard digit (1-based -> slot)
  const onDigit = useCallback(
    (n: number) => {
      const p = powerupList[n - 1];
      if (p) game.activatePowerup(p);
    },
    [powerupList, game],
  );

  useInput(boardEl, {
    onMove: game.move,
    onDigit: powerupList.length ? onDigit : undefined,
    onNewGame: requestNewGame,
    onEscape: selecting ? game.cancelPowerup : undefined,
    enabled: !menuOpen && !confirmOpen,
  });

  // selection predicates for the board
  const selectableTiles = useMemo(() => {
    if (!selecting || !selection) return undefined;
    return (tile: Tile): boolean => {
      switch (selection.kind) {
        case 'tileAndEmptyCell':
          return !selection.tile; // pick tile only in first step
        case 'multipleTile':
          return !(selection.tiles ?? []).some((t) => t.id === tile.id);
        case 'adjacentTilesDirectional':
          if (!selection.origin) return true;
          return isOrthogonalNeighbor(selection.origin.position, tile.position);
        case 'byValue':
          return true;
        default:
          return false;
      }
    };
  }, [selecting, selection]);

  const selectableCell = useMemo(() => {
    if (!selecting || !selection) return undefined;
    return (_pos: Position): boolean => {
      if (selection.kind === 'tileAndEmptyCell') return !!selection.tile;
      if (selection.kind === 'bomb') return true;
      return false;
    };
  }, [selecting, selection]);

  const selectedTileIds = useMemo(() => {
    if (!selection) return [];
    const ids: number[] = [];
    if (selection.tile) ids.push(selection.tile.id);
    if (selection.origin) ids.push(selection.origin.id);
    for (const t of selection.tiles ?? []) ids.push(t.id);
    return ids;
  }, [selection]);

  // rotation needs a direction picker instead of board taps
  const needsDirection = selecting && selection?.kind === 'rotation';

  return (
    <div class='relative flex min-h-0 grow flex-col gap-3 pt-1.5 sm:gap-4 sm:px-3'>
      <Header
        mode={mode}
        score={gameplay.score}
        best={best}
        onMenu={() => setMenuOpen(true)}
        onNewGame={requestNewGame}
      />

      <div class='mx-auto flex min-h-0 w-full max-w-screen-md grow basis-0 flex-col items-stretch gap-4'>
        {powerupList.length > 0 && (
          <PowerupBar
            mode={mode}
            powerups={gameplay.powerups}
            dark={dark}
            onActivate={game.activatePowerup}
          />
        )}

        <div class='flex min-h-0 grow basis-0 flex-col items-center justify-center px-8 sm:px-0'>
          <GameBoard
            ref={setBoardEl}
            board={gameplay.board}
            theme={dark ? BoardTheme.Dark : BoardTheme.Light}
            lastAction={gameplay.lastAction}
            selectableTiles={selectableTiles}
            selectedTileIds={selectedTileIds}
            onTileClick={game.selectTile}
            selectableCell={selectableCell}
            onCellClick={game.selectCell}
          />
        </div>

        {/* selection prompt / rotation picker / tutorial callout */}
        {selecting && selection ? (
          needsDirection ? (
            <div class='flex flex-col items-center gap-2'>
              <SelectionCallout selection={selection} onCancel={game.cancelPowerup} />
              <div class='flex gap-3'>
                <button
                  class='rounded-xl bg-tan px-4 py-2 font-bold text-white shadow-button'
                  onClick={() => game.selectDirection(RotationDirection.CounterClockwise)}
                >
                  ↺ Counter-clockwise
                </button>
                <button
                  class='rounded-xl bg-tan px-4 py-2 font-bold text-white shadow-button'
                  onClick={() => game.selectDirection(RotationDirection.Clockwise)}
                >
                  Clockwise ↻
                </button>
              </div>
            </div>
          ) : (
            <SelectionCallout selection={selection} onCancel={game.cancelPowerup} />
          )
        ) : mode === GameMode.Tutorial ? (
          <TutorialCallout gameplay={gameplay} />
        ) : null}

        <Footer />
      </div>

      <GameEndOverlay
        gameplay={gameplay}
        best={best}
        onUndo={game.undo}
        onNewGame={game.newGame}
        onContinueAfterWin={game.continueAfterWin}
        onNavigateClassic={() => onNavigate('/classic')}
      />

      <ConfirmDialog
        open={confirmOpen}
        onConfirm={confirmNewGame}
        onCancel={() => setConfirmOpen(false)}
      />

      <Menu
        open={menuOpen}
        currentMode={mode}
        onClose={() => setMenuOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function isOrthogonalNeighbor(a: Position, b: Position): boolean {
  return (
    (a.x === b.x && Math.abs(a.y - b.y) === 1) ||
    (a.y === b.y && Math.abs(a.x - b.x) === 1)
  );
}

export { Powerup };
