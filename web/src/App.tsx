import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AiClient } from './ai/client';
import { STEP_MS, useSpeed } from './animation/speed';
import { arrivals } from './animation/steps';
import { usePlayback } from './animation/usePlayback';
import { Board } from './board/Board';
import { EndOfGame } from './components/EndOfGame';
import { Header } from './components/Header';
import { NewGameSheet, type NewGameChoice } from './components/NewGameSheet';
import { PuzzleStatus } from './components/PuzzleStatus';
import { RotatePrompt } from './components/RotatePrompt';
import { SettingsPopover } from './components/SettingsPopover';
import { StatusLine } from './components/StatusLine';
import { legalMoves, newBoard, type BoardSnapshot, type Player } from './engine';
import { describeResult, playerName, puzzleNames } from './game/presentation';
import { initialPuzzleState, playablePits, puzzleBoard, puzzleReducer, puzzleStatus } from './game/puzzle';
import { freshSeed, gameReducer, initialState, shownViewer, type GameState } from './game/reducer';
import type { Settings } from './game/settings';
import { statusText } from './game/status';
import { REDUCED_MOTION, SIDEWAYS_PHONE, UPRIGHT_PHONE, useMediaQuery } from './hooks/useMediaQuery';
import { createDirectPuzzleClient, type PuzzleClient } from './puzzles/client';
import { usePuzzleSupply } from './puzzles/supply';
import './App.css';

/** Without a worker (tests that don't pass one), puzzles are made on the page's own thread. */
const DIRECT_PUZZLES = createDirectPuzzleClient();

interface AppProps {
  /** Chooses the computer's moves: a Web Worker in the browser, a stand-in in tests. */
  ai: AiClient;
  /** Makes puzzles: a Web Worker in the browser, a stand-in in tests. */
  puzzles?: PuzzleClient;
  /** Start from a particular game instead of the default (used by tests). */
  start?: GameState;
}

export function App({ ai, puzzles = DIRECT_PUZZLES, start }: AppProps) {
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

  // Puzzles (add-puzzles design.md decision 7). Their reducer lives here, next
  // to the game's, so the count for this visit survives a game in between.
  const [mode, setMode] = useState<'game' | 'puzzles'>('game');
  const [puzzle, puzzleDispatch] = useReducer(puzzleReducer, initialPuzzleState);
  const supply = usePuzzleSupply(puzzles);
  const lastRequest = useRef(0);
  const inPuzzles = mode === 'puzzles';

  /** Asks for the next puzzle. If the player has moved on by the time it arrives, the reducer ignores it. */
  const nextPuzzle = () => {
    const requestId = ++lastRequest.current;
    puzzleDispatch({ type: 'requested', requestId });
    supply.take().then(
      (made) => puzzleDispatch({ type: 'arrived', requestId, puzzle: made }),
      (error) => console.error('Could not make a puzzle:', error),
    );
  };

  // Show each move seed by seed, then let the game carry on (design.md decision 6).
  // Reduced motion means no animation at all, whatever the speed.
  const stepMs = reducedMotion ? 0 : STEP_MS[speed];
  // One playback for whichever is showing: the game's latest move, or the puzzle's answer.
  const playback = usePlayback(
    inPuzzles ? puzzle.lastMove : state.lastMove,
    inPuzzles ? puzzle.phase === 'animating' : state.phase === 'animating',
    stepMs,
    () => (inPuzzles ? puzzleDispatch({ type: 'animationDone' }) : dispatch({ type: 'animationDone' })),
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
  const begin = (choice: NewGameChoice) => {
    if (choice.kind === 'puzzles') {
      setMode('puzzles');
      nextPuzzle();
    } else {
      if (inPuzzles) puzzleDispatch({ type: 'left' });
      setMode('game');
      startGame(choice.settings);
    }
  };
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

  const puzzleWords = puzzleStatus(puzzle);
  const status = inPuzzles ? (
    <PuzzleStatus
      message={puzzleWords.message}
      detail={puzzleWords.detail}
      onShowAnswer={puzzle.phase === 'solving' ? () => puzzleDispatch({ type: 'showAnswer' }) : undefined}
      onNext={nextPuzzle}
    />
  ) : phase === 'over' ? (
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
        matchup={
          inPuzzles ? (
            <span className="matchup">
              {/* On a sideways phone only "Puzzle" shows; the rest stays for screen readers. */}
              <strong className="puzzle-title">
                Puzzle<span className="puzzle-title-long"> · Find the best move</span>
              </strong>
              <span className="tally">
                Solved {puzzle.tally.solved} of {puzzle.tally.played}
              </span>
            </span>
          ) : undefined
        }
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

      <main className={inPuzzles && puzzle.phase === 'loading' ? 'play preparing' : 'play'}>
        <Board
          board={playback ? playback.step.board : inPuzzles ? (puzzleBoard(puzzle) ?? newBoard()) : board}
          viewer={inPuzzles ? (puzzle.puzzle?.board.toMove ?? 'south') : shownViewer(state)}
          names={inPuzzles ? puzzleNames(puzzle.puzzle?.board ?? newBoard()) : names}
          playable={inPuzzles ? playablePits(puzzle) : playable}
          onPlay={(pit) => (inPuzzles ? puzzleDispatch({ type: 'pitChosen', pit }) : dispatch({ type: 'movePlayed', pit }))}
          marks={
            inPuzzles
              ? { wrong: puzzle.wrong, reveal: puzzle.outcome === 'revealed' ? puzzle.puzzle?.answer : null }
              : undefined
          }
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
          initialPuzzles={inPuzzles}
          onCancel={closeSheet}
          onStart={(choice) => {
            begin(choice);
            closeSheet();
          }}
        />
      )}
    </div>
  );
}
