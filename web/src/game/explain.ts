// Turning the AI's scores and lines into words and replay steps
// (add-move-explainer design.md decision 5). Pure functions: no React.

import { play, type BoardSnapshot, type MoveExplanation, type Player } from '../engine';
import type { PlayedMove } from './reducer';

/** One move of a line, ready to animate, with what to say about it. */
export interface ReplayStep {
  move: PlayedMove;
  caption: string;
}

/** Everything the explainer shows for one pit. */
export interface MoveDescription {
  /** 0..=5, the mover's own numbering (shown on screen as pit + 1). */
  pit: number;
  score: number;
  /** Starred: no other move scores higher. */
  best: boolean;
  /** What the move does at once: "extra turn", "captures 5 seeds", both, or null. */
  now: string | null;
  /** How it ends after best play, from the mover's side: "you're 4 seeds ahead", ... */
  result: string;
  steps: ReplayStep[];
}

const seeds = (n: number) => `${n} ${n === 1 ? 'seed' : 'seeds'}`;

/** "You play" but "Opponent plays". */
const verb = (name: string, base: string) => (name === 'You' ? base : `${base}s`);

/** "You play pit 5.", "Opponent plays pit 2 and captures 6 seeds.", ... */
export function stepCaption(name: string, pit: number, outcome: { extraTurn: boolean; captured: number }): string {
  const parts = [`${name} ${verb(name, 'play')} pit ${pit + 1}`];
  if (outcome.captured > 0) parts.push(`${verb(name, 'capture')} ${seeds(outcome.captured)}`);
  if (outcome.extraTurn) parts.push(`${name === 'You' ? 'get' : 'gets'} another turn`);
  const last = parts.pop()!;
  return parts.length === 0 ? `${last}.` : `${parts.join(', ')} and ${last}.`;
}

/** The words for where the line ends, from `mover`'s side. */
export function resultWords(end: BoardSnapshot, mover: Player, score: number): string {
  switch (end.status.kind) {
    case 'won':
      return end.status.winner === mover ? 'you win the game' : 'you lose the game';
    case 'draw':
      return 'a draw';
    case 'playing':
      // The game goes on: the score is the store lead after the line.
      if (score === 0) return 'level';
      return score > 0 ? `you're ${seeds(score)} ahead` : `you're ${seeds(-score)} behind`;
  }
}

/** Describes one move: replays its line from `board` to caption each step. */
export function describeLine(
  board: BoardSnapshot,
  explanation: MoveExplanation,
  names: Record<Player, string>,
  bestScore: number,
): MoveDescription {
  const steps: ReplayStep[] = [];
  let position = board;
  for (const pit of explanation.line) {
    const result = play(position, pit);
    const by = position.toMove;
    steps.push({ move: { by, pit, before: position, result }, caption: stepCaption(names[by], pit, result) });
    position = result.board;
  }

  const first = steps[0].move.result;
  const now = [first.captured > 0 ? `captures ${seeds(first.captured)}` : null, first.extraTurn ? 'extra turn' : null]
    .filter((part) => part !== null)
    .join(' · ');

  return {
    pit: explanation.pit,
    score: explanation.score,
    best: explanation.score === bestScore,
    now: now === '' ? null : now,
    result: resultWords(position, board.toMove, explanation.score),
    steps,
  };
}

/** Describes every move, in the order given (best first, from `explainMoves`). */
export function describeMoves(
  board: BoardSnapshot,
  explanations: MoveExplanation[],
  names: Record<Player, string>,
): MoveDescription[] {
  const bestScore = Math.max(...explanations.map((e) => e.score));
  return explanations.map((e) => describeLine(board, e, names, bestScore));
}
