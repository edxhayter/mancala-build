import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AiClient } from './ai/client';
import { STEP_MS, useSpeed } from './animation/speed';
import { arrivals } from './animation/steps';
import { usePlayback } from './animation/usePlayback';
import { Board } from './board/Board';
import { EndOfGame } from './components/EndOfGame';
import { Header } from './components/Header';
import { NewGameSheet } from './components/NewGameSheet';
import { RotatePrompt } from './components/RotatePrompt';
import { SettingsPopover } from './components/SettingsPopover';
import { StatusLine } from './components/StatusLine';
import { legalMoves, type BoardSnapshot, type Player } from './engine';
import { describeResult, playerName } from './game/presentation';
import { freshSeed, gameReducer, initialState, shownViewer, type GameState } from './game/reducer';
import type { Settings } from './game/settings';
import { statusText } from './game/status';
import { REDUCED_MOTION, SIDEWAYS_PHONE, UPRIGHT_PHONE, useMediaQuery } from './hooks/useMediaQuery';
import './App.css';

interface AppProps {
  /** Chooses the computer's moves: a Web Worker in the browser, a stand-in in tests. */
  ai: AiClient;
  /** Start from a particular game instead of the default (used by tests). */
  start?: GameState;
}

export function App({ ai, start }: AppProps) {
  // The whole game lives in one reducer (design.md decision 4). The third
  // argument builds the first state once, so freshSeed() isn't called on every render.
  const [state, dispatch] = useReducer(gameReducer, start, (s) => s ?? initialState(freshSeed()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const newGameButton = useRef<HTMLButtonElement>(null);
  const askedAbout = useRef<BoardSnapshot | null>(null);
  const upright = useMediaQuery(UPRIGHT_PHONE);
  const phone = useMediaQuery(SIDEWAYS_PHONE);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const [speed, setSpeed] = useSpeed();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);

  // Show each move seed by seed, then let the game carry on (design.md decision 6).
  // Reduced motion means no animation at all, whatever the speed.
  const stepMs = reducedMotion ? 0 : STEP_MS[speed];
  const playback = usePlayback(state.lastMove, state.phase === 'animating', stepMs, () =>
    dispatch({ type: 'animationDone' }),
  );

  // When it's the computer's turn, ask the AI. The answer comes back later,
  // tagged with this game's id: if a new game has started by then, the
  // reducer ignores it (spec: The page stays responsive).
  useEffect(() => {
    if (state.phase !== 'thinking' || askedAbout.current === state.board) return;
    askedAbout.current = state.board; // ask once per position, even if this effect runs twice
    const { gameId, seed, board, settings } = state;
    ai.choose({ gameId, seed, board, level: settings.level }).then(
      (pit) => dispatch({ type: 'aiChose', pit, gameId }),
      (error) => console.error('The AI could not choose a move:', error),
    );
  }, [state, ai]);

  const { settings, board, phase } = state;
  const names: Record<Player, string> = {
    south: playerName(settings, 'south'),
    north: playerName(settings, 'north'),
  };
  // Only on a person's turn, and then the mover is always the viewer.
  const playable = phase === 'human' ? legalMoves(board) : [];

  const startGame = (next: Settings) => dispatch({ type: 'newGame', settings: next, seed: freshSeed() });
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  }, []);
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
        settingsOpen={settingsOpen}
        onSettings={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}
        settingsRef={settingsButton}
        settings_panel={<SettingsPopover speed={speed} onSpeed={setSpeed} onClose={closeSettings} />}
      />
      {!phone && <div className="woven-band" aria-hidden="true" />}

      <main className="play">
        <Board
          board={playback ? playback.step.board : board}
          viewer={shownViewer(state)}
          names={names}
          playable={playable}
          onPlay={(pit) => dispatch({ type: 'movePlayed', pit })}
          cup={phone ? 76 : 100}
          glow={playback ? (playback.step.kind === 'lift' ? playback.step.from : playback.step.to) : []}
          arrivals={playback ? arrivals(playback.step, playback.previous) : []}
          travelMs={stepMs * 0.85}
          stepKey={playback?.index ?? 0}
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
