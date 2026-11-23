import { useEffect, useReducer, useRef, useState } from 'react';
import { Board } from './board/Board';
import { EndOfGame } from './components/EndOfGame';
import { Header } from './components/Header';
import { NewGameSheet } from './components/NewGameSheet';
import { RotatePrompt } from './components/RotatePrompt';
import { StatusLine } from './components/StatusLine';
import { legalMoves, type Player } from './engine';
import { describeResult, playerName } from './game/presentation';
import { freshSeed, gameReducer, initialState, shownViewer, type GameState } from './game/reducer';
import type { Settings } from './game/settings';
import { statusText } from './game/status';
import { SIDEWAYS_PHONE, UPRIGHT_PHONE, useMediaQuery } from './hooks/useMediaQuery';
import './App.css';

interface AppProps {
  /** Start from a particular game instead of the default (used by tests). */
  start?: GameState;
}

export function App({ start }: AppProps) {
  // The whole game lives in one reducer (design.md decision 4). The third
  // argument builds the first state once, so freshSeed() isn't called on every render.
  const [state, dispatch] = useReducer(gameReducer, start, (s) => s ?? initialState(freshSeed()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const newGameButton = useRef<HTMLButtonElement>(null);
  const upright = useMediaQuery(UPRIGHT_PHONE);
  const phone = useMediaQuery(SIDEWAYS_PHONE);

  // Until the sowing animation exists (task 8.2), every move finishes at once.
  useEffect(() => {
    if (state.phase === 'animating') dispatch({ type: 'animationDone' });
  }, [state.phase, state.lastMove]);

  const { settings, board, phase } = state;
  const names: Record<Player, string> = {
    south: playerName(settings, 'south'),
    north: playerName(settings, 'north'),
  };
  // Only on a person's turn, and then the mover is always the viewer.
  const playable = phase === 'human' ? legalMoves(board) : [];

  const startGame = (next: Settings) => dispatch({ type: 'newGame', settings: next, seed: freshSeed() });
  const closeSheet = () => {
    setSheetOpen(false);
    newGameButton.current?.focus(); // put keyboard focus back where it was
  };

  // A phone held upright shows only the prompt. The game state above is kept,
  // so turning the phone back shows the game exactly where it was.
  if (upright) return <RotatePrompt />;

  const status =
    phase === 'over' ? (
      <EndOfGame
        result={describeResult(settings, board)}
        board={board}
        names={names}
        onPlayAgain={() => startGame(settings)}
      />
    ) : (
      <StatusLine text={statusText(state)} caption={state.caption} />
    );

  return (
    <div className={phone ? 'page phone' : 'page'}>
      <Header
        settings={settings}
        onNewGame={() => setSheetOpen(true)}
        newGameRef={newGameButton}
        compact={phone}
        status={status}
      />
      {!phone && <div className="woven-band" aria-hidden="true" />}

      <main className="play">
        <Board
          board={board}
          viewer={shownViewer(state)}
          names={names}
          playable={playable}
          onPlay={(pit) => dispatch({ type: 'movePlayed', pit })}
          cup={phone ? 76 : 100}
        />
        {!phone && status}
      </main>

      {sheetOpen && (
        <NewGameSheet
          initial={settings}
          onCancel={closeSheet}
          onStart={(next) => {
            startGame(next);
            closeSheet();
          }}
        />
      )}
    </div>
  );
}
