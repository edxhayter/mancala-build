// The board, drawn in SVG to the approved brief (design.md decision 10),
// ported from design/concepts/Board.dc.html.
//
// It only draws: the game state comes in through props, and a click on a
// playable pit is reported through `onPlay`. The viewer's pits run along the
// bottom 1 to 6 towards their store on the right (the CLI's viewer rule).

import { useId, type KeyboardEvent } from 'react';
import { opponent, type BoardSnapshot, type Player } from '../engine';
import { geometry } from './geometry';
import { seedSpots } from './seeds';
import './Board.css';

/** Puzzle feedback on the viewer's pits, 0..5 (used by a later change). */
export interface PuzzleMarks {
  wrong?: number | null;
  reveal?: number | null;
}

export interface BoardProps {
  board: BoardSnapshot;
  /** Whose side is drawn along the bottom. */
  viewer: Player;
  /** Shown under each store: "You" / "AI", or "South" / "North". */
  names: Record<Player, string>;
  /** The viewer's pits (0..5) that can be played right now. */
  playable: number[];
  onPlay: (pit: number) => void;
  /** Cup diameter in px: 100 on desktop, 76 on a phone. */
  cup?: number;
  marks?: PuzzleMarks;
  /** Draw the numbers and names beside the board (off for a small decorative board). */
  labels?: boolean;
}

/** One cup on screen: which pit or store it is, and where it's drawn. */
interface CupPlace {
  player: Player;
  place: number | 'store';
  x: number;
  y: number;
  /** Which number band its labels go in. */
  band: 'top' | 'bottom';
  /** The small label: the pit number, or the store owner's name. */
  tag: string;
}

const title = (player: Player) => (player === 'south' ? 'South' : 'North');
const plural = (n: number) => (n === 1 ? '1 seed' : `${n} seeds`);
const fixed = (v: number) => v.toFixed(1);

/** A fixed number per pit or store (1..14), so each cup's seeds look different. */
const seedKey = (player: Player, place: number | 'store') =>
  (player === 'south' ? 0 : 7) + (place === 'store' ? 6 : place) + 1;

export function Board({
  board,
  viewer,
  names,
  playable,
  onPlay,
  cup = 100,
  marks = {},
  labels = true,
}: BoardProps) {
  const g = geometry(cup, labels);
  const { D, r, L } = g;
  const s = (v: number) => (v * D) / 100; // concept values were drawn at D = 100

  // SVG ids must be unique on the page (there can be two boards: the rotate
  // prompt draws a small one), so prefix them with an id React generates.
  const prefix = 'b' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${prefix}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  // Where everything goes, from the viewer's side.
  const other = opponent(viewer);
  const cups: CupPlace[] = [];
  for (let k = 0; k < 6; k++) {
    // Top row, left to right: the opponent's pit 6 down to 1, each above the pit it faces.
    cups.push({ player: other, place: 5 - k, x: g.x(k), y: g.yTop, band: 'top', tag: String(6 - k) });
    // Bottom row: the viewer's pits 1 to 6.
    cups.push({ player: viewer, place: k, x: g.x(k), y: g.yBottom, band: 'bottom', tag: String(k + 1) });
  }
  cups.push({ player: other, place: 'store', x: g.x(-1), y: g.yMid, band: 'top', tag: names[other] });
  cups.push({ player: viewer, place: 'store', x: g.x(6), y: g.yMid, band: 'bottom', tag: names[viewer] });

  // A label in the number band: `fromEdge` is how far in from the board's outer edge, in bands.
  const bandY = (band: 'top' | 'bottom', fromEdge: number) =>
    band === 'top' ? L * fromEdge : g.height - L * fromEdge;

  // The wood: a disc round every cup, joined by a rectangle.
  const woodShapes = (className: string, fill?: string) => (
    <g className={className} fill={fill}>
      {cups.map((c) => (
        <circle key={`${c.player}-${c.place}`} cx={c.x} cy={c.y} r={r} />
      ))}
      <rect x={g.x(-1)} y={g.yTop} width={g.x(6) - g.x(-1)} height={g.yBottom - g.yTop} />
    </g>
  );

  const seedGradient = (name: string, base: string) => (
    <radialGradient id={id(name)} cx="0.34" cy="0.3" r="0.8">
      <stop offset="0" style={{ stopColor: 'var(--seed-light)' }} />
      <stop offset="0.48" style={{ stopColor: base }} />
      <stop offset="1" style={{ stopColor: 'var(--seed-dark)' }} />
    </radialGradient>
  );

  return (
    <svg
      className="board"
      role="group"
      aria-label="Board"
      viewBox={`0 0 ${fixed(g.width)} ${fixed(g.height)}`}
      width={fixed(g.width)}
      height={fixed(g.height)}
    >
      <defs>
        {/* Wood grain: faint dark and light stripes, tilted a little. */}
        <pattern id={id('grain')} patternUnits="userSpaceOnUse" width={g.width} height={s(24)} patternTransform="rotate(-3)">
          <rect width={g.width} height={s(2)} fill="rgb(70 28 4 / 0.08)" />
          <rect y={s(9)} width={g.width} height={s(2)} fill="rgb(255 226 190 / 0.07)" />
        </pattern>
        <pattern id={id('fine-grain')} patternUnits="userSpaceOnUse" width={g.width} height={s(37)} patternTransform="rotate(1)">
          <rect width={g.width} height="1" fill="rgb(70 28 4 / 0.05)" />
        </pattern>
        <filter id={id('wood-shadow')} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy={s(10)} stdDeviation={s(6)} floodColor="rgb(40 16 3)" floodOpacity="0.38" />
          <feDropShadow dx="0" dy={s(2)} stdDeviation={s(1)} floodColor="rgb(40 16 3)" floodOpacity="0.3" />
        </filter>
        <filter id={id('seed-shadow')} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy={s(2)} stdDeviation={s(1)} floodColor="rgb(35 14 2)" floodOpacity="0.45" />
        </filter>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={s(8)} />
        </filter>
        {/* The hollow of a cup: darker towards the top edge, like a shadow cast into it. */}
        <radialGradient id={id('hollow')} cx="0.5" cy="0.6" r="0.62">
          <stop offset="0.55" stopColor="rgb(58 20 2)" stopOpacity="0" />
          <stop offset="1" stopColor="rgb(58 20 2)" stopOpacity="0.62" />
        </radialGradient>
        <radialGradient id={id('knob')} cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="rgb(255 222 186)" stopOpacity="0.35" />
          <stop offset="1" stopColor="rgb(30 10 0)" stopOpacity="0.2" />
        </radialGradient>
        {seedGradient('seed', 'var(--seed)')}
        {seedGradient('seed-alt', 'var(--seed-alt)')}
      </defs>

      {/* The wood, its shadow, then the grain on top. */}
      <g filter={url('wood-shadow')}>{woodShapes('wood')}</g>
      {woodShapes('grain', url('grain'))}
      {woodShapes('grain', url('fine-grain'))}

      {/* The seam where the board folds, and the hinge knob in the middle. */}
      <rect className="seam" x={g.x(-1) + r} y={g.yMid - 1} width={g.x(6) - g.x(-1) - 2 * r} height="2" />
      <circle className="knob" cx={g.width / 2} cy={g.yMid} r={s(16)} />
      <circle cx={g.width / 2} cy={g.yMid} r={s(16)} fill={url('knob')} />

      {cups.map((c) => {
        const count = c.place === 'store' ? board.stores[c.player] : board.pits[c.player][c.place];
        const label =
          c.place === 'store'
            ? `${title(c.player)} store, ${plural(count)}`
            : `${title(c.player)} pit ${c.place + 1}, ${plural(count)}`;

        // Only the viewer's six pits are buttons; the rest are pictures with a label.
        const pit = c.place !== 'store' && c.player === viewer ? c.place : null;
        const canPlay = pit !== null && playable.includes(pit);
        const interaction =
          pit === null
            ? { role: 'img' }
            : {
                role: 'button',
                tabIndex: canPlay ? 0 : -1,
                'aria-disabled': !canPlay,
                onClick: () => canPlay && onPlay(pit),
                onKeyDown: (event: KeyboardEvent) => {
                  if (canPlay && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault(); // stop Space scrolling the page
                    onPlay(pit);
                  }
                },
              };

        const key = seedKey(c.player, c.place);
        return (
          <g
            key={`${c.player}-${c.place}`}
            className={`cup-group${canPlay ? ' playable' : ''}`}
            aria-label={label}
            {...interaction}
          >
            {pit !== null && pit === marks.wrong && (
              <circle className="mark-wrong" cx={c.x} cy={c.y} r={0.55 * D - s(2)} strokeWidth={s(4)} />
            )}
            {pit !== null && pit === marks.reveal && (
              <g className="mark-reveal">
                <circle cx={c.x} cy={c.y} r={0.55 * D + s(6)} strokeWidth={s(16)} filter={url('glow')} />
                <circle cx={c.x} cy={c.y} r={0.55 * D + s(2)} strokeWidth={s(4)} />
              </g>
            )}
            <circle className="focus-ring" cx={c.x} cy={c.y} r={0.5 * D + s(5)} strokeWidth={s(3)} />

            <circle className="cup" cx={c.x} cy={c.y} r={D / 2} />
            <circle cx={c.x} cy={c.y} r={D / 2} fill={url('hollow')} />
            <circle className="lip" cx={c.x} cy={c.y} r={D / 2} strokeWidth={s(2)} />

            <g filter={url('seed-shadow')}>
              {seedSpots(count, key, D).map((seed, n) => (
                <g
                  key={n}
                  data-seed=""
                  transform={`translate(${fixed(c.x + seed.x)} ${fixed(c.y + seed.y)}) rotate(${seed.rotate})`}
                >
                  <ellipse rx={fixed(seed.rx)} ry={fixed(seed.ry)} fill={url(seed.alt ? 'seed-alt' : 'seed')} />
                  {seed.scar && (
                    <ellipse
                      className="scar"
                      cx={fixed(seed.rx * 0.24 + s(2))}
                      cy={fixed(-seed.ry * 0.16 + s(1.5))}
                      rx={fixed(s(2))}
                      ry={fixed(s(1.5))}
                    />
                  )}
                </g>
              ))}
            </g>

            {labels && (
              <>
                <text className="count" x={c.x} y={bandY(c.band, 0.62)} fontSize={12 + 0.1 * D}>
                  {count}
                </text>
                <text className="tag" x={c.x} y={bandY(c.band, 0.2)} fontSize={9 + 0.03 * D}>
                  {c.tag}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
