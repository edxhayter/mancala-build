import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AiClient } from './ai/client';
import { STEP_MS, useSpeed } from './animation/speed';
import { arrivals } from './animation/steps';
import { usePlayback } from './animation/usePlayback';
import { Board } from './board/Board';
import { EndOfGame } from './components/EndOfGame';
import { ExplainerSheet } from './components/ExplainerSheet';
import { Header } from './components/Header';
import { NewGameSheet, type NewGameChoice } from './components/NewGameSheet';
import { PuzzleStatus } from './components/PuzzleStatus';
import { ReplayBar } from './components/ReplayBar';
import { RotatePrompt } from './components/RotatePrompt';
import { SettingsPopover } from './components/SettingsPopover';
import { StatusLine } from './components/StatusLine';
import { legalMoves, newBoard, type BoardSnapshot, type Player } from './engine';
import { describeMoves } from './game/explain';
import { closedExplainer, explainerBoard, explainerReducer, replayItem, replayMove, replayStatus } from './game/explainer';
import { describeResult, playerName, puzzleNames } from './game/presentation';
import { initialPuzzleState, playablePits, puzzleBoard, puzzleReducer, puzzleStatus } from './game/puzzle';
import { freshSeed, gameReducer, initialState, shownViewer, type GameState } from './game/reducer';
import type { Settings } from './game/settings';
import { statusText } from './game/status';
import { REDUCED_MOTION, SIDEWAYS_PHONE, UPRIGHT_PHONE, useMediaQuery } from './hooks/useMediaQuery';
import { createDirectAnalysisClient, type AnalysisClient } from './analysis/client';
import { usePuzzleSupply } from './puzzles/supply';
import './App.css';

/** Without a worker (tests that don't pass one), analysis runs on the page's own thread. */
const DIRECT_ANALYSIS = createDirectAnalysisClient();

interface AppProps {
  /** Chooses the computer's moves: a Web Worker in the browser, a stand-in in tests. */
  ai: AiClient;
  /** Makes puzzles and explanations: a Web Worker in the browser, a stand-in in tests. */
  analysis?: AnalysisClient;
  /** Start from a particular game instead of the default (used by tests). */
  start?: GameState;
}

export function App({ ai, analysis = DIRECT_ANALYSIS, start }: AppProps) {
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
  const supply = usePuzzleSupply(analysis);
  const lastRequest = useRef(0);
  const inPuzzles = mode === 'puzzles';

  // The explainer (add-move-explainer design.md decision 7): a list of every
  // move, and a step-by-step replay of one move's line on the board.
  const [explainer, explainerDispatch] = useReducer(explainerReducer, closedExplainer);
  const explaining = explainer.status === 'open';
  const replay = replayMove(explainer);
  const explainButton = useRef<HTMLButtonElement>(null);

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
  // One playback for whichever is showing: a step of the explainer's replay
  // first, then the puzzle's answer or the game's latest move.
  const playback = usePlayback(
    replay ?? (inPuzzles ? puzzle.lastMove : state.lastMove),
    replay !== null || (!explaining && (inPuzzles ? puzzle.phase === 'animating' : state.phase === 'animating')),
    stepMs,
    () => {
      if (replay) explainerDispatch({ type: 'stepLanded' });
      else if (inPuzzles) puzzleDispatch({ type: 'animationDone' });
      else dispatch({ type: 'animationDone' });
    },
  );

  // Once the explainer has closed, put focus back on the button that opened it
  // (Why? or Analyze). It only exists again after this render, hence an effect.
  const focusAfterClose = useRef(false);
  useEffect(() => {
    if (explainer.status === 'closed' && focusAfterClose.current) {
      focusAfterClose.current = false;
      explainButton.current?.focus();
    }
  }, [explainer.status]);

  // A pending analysis is dropped as soon as the game moves on: a move played,
  // a new game, or a switch to puzzles (spec: A late analysis is ignored).
  useEffect(() => {
    if (explainer.status !== 'analyzing') return;
    const asked = explainer.source;
    if (inPuzzles || asked.gameId !== state.gameId || asked.board !== state.board) {
      explainerDispatch({ type: 'closed' });
    }
  }, [explainer, state.gameId, state.board, inPuzzles]);

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
    explainerDispatch({ type: 'closed' });
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
  const openWhy = () => {
    const shown = puzzle.puzzle;
    if (shown === null) return;
    const items = describeMoves(shown.board, shown.explanation, puzzleNames(shown.board));
    explainerDispatch({ type: 'opened', source: { kind: 'puzzle' }, position: shown.board, items });
  };
  // Analyze (add-move-explainer): explain the current position on your turn.
  // The answer is tagged with the game and position it was asked about.
  const analyze = () => {
    const { gameId, board: position } = state;
    explainerDispatch({ type: 'analysisAsked', gameId, board: position });
    analysis.explain(position).then(
      (explanation) =>
        explainerDispatch({
          type: 'analysisArrived',
          gameId,
          board: position,
          items: describeMoves(position, explanation, names),
        }),
      (error) => console.error('Could not analyze the position:', error),
    );
  };
  const closeExplainer = () => {
    explainerDispatch({ type: 'closed' });
    focusAfterClose.current = true; // see the effect below
  };
  const closeSheet = () => {
    setSheetOpen(false);
    newGameButton.current?.focus(); // put keyboard focus back where it was
  };

  // A phone held upright shows only the prompt. The game state above is kept,
  // so turning the phone back shows the game exactly where it was.
  if (upright) return <RotatePrompt />;

  const puzzleWords = puzzleStatus(puzzle);
  const replayWords = replayStatus(explainer);
  const replaying = replayItem(explainer);
  const status = replayWords && replaying ? (
    <ReplayBar
      title={`Why pit ${replaying.pit + 1}`}
      caption={replayWords.caption}
      result={replayWords.result}
      canNext={replayWords.canNext}
      onNext={() => explainerDispatch({ type: 'nextMove' })}
      onBack={() => explainerDispatch({ type: 'back' })}
    />
  ) : inPuzzles ? (
    <PuzzleStatus
      message={puzzleWords.message}
      detail={puzzleWords.detail}
      onShowAnswer={puzzle.phase === 'solving' ? () => puzzleDispatch({ type: 'showAnswer' }) : undefined}
      onWhy={puzzle.phase === 'done' ? openWhy : undefined}
      whyRef={explainButton}
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
      <StatusLine
        text={statusText(state)}
        caption={state.caption}
        onAnalyze={settings.opponent === 'ai' && phase === 'human' && explainer.status === 'closed' ? analyze : undefined}
        analyzing={explainer.status === 'analyzing'}
        analyzeRef={explainButton}
      />
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
          {...(explainer.status === 'open'
            ? {
                // Explaining: the explained position (or a step of its line), from the explained side.
                board: playback ? playback.step.board : (explainerBoard(explainer) ?? board),
                viewer: explainer.position.toMove,
                names: explainer.source.kind === 'puzzle' ? puzzleNames(explainer.position) : names,
                playable: [],
              }
            : inPuzzles
              ? {
                  board: playback ? playback.step.board : (puzzleBoard(puzzle) ?? newBoard()),
                  viewer: puzzle.puzzle?.board.toMove ?? 'south',
                  names: puzzleNames(puzzle.puzzle?.board ?? newBoard()),
                  playable: playablePits(puzzle),
                  marks: { wrong: puzzle.wrong, reveal: puzzle.outcome === 'revealed' ? puzzle.puzzle?.answer : null },
                }
              : {
                  board: playback ? playback.step.board : board,
                  viewer: shownViewer(state),
                  names,
                  playable,
                })}
          onPlay={(pit) => (inPuzzles ? puzzleDispatch({ type: 'pitChosen', pit }) : dispatch({ type: 'movePlayed', pit }))}
          cup={phone ? 76 : 100}
          glow={playback ? (playback.step.kind === 'lift' ? playback.step.from : playback.step.to) : []}
          arrivals={playback ? arrivals(playback.step, playback.previous) : []}
          travelMs={stepMs * 0.85}
          stepKey={playback?.index ?? 0}
        />
        {!phone && status}
      </main>

      {explainer.status === 'open' && explainer.view.kind === 'list' && (
        <ExplainerSheet
          title={explainer.source.kind === 'puzzle' ? 'Why?' : 'Analysis'}
          items={explainer.items}
          onShowWhy={(pit) => explainerDispatch({ type: 'showWhy', pit })}
          closeLabel={explainer.source.kind === 'puzzle' ? 'Back to the puzzle' : 'Back to the game'}
          onClose={closeExplainer}
        />
      )}

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
