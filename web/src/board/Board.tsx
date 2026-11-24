// The board, drawn in SVG to the approved brief (design.md decision 10),
// ported from design/concepts/Board.dc.html.
//
// It only draws: the game state comes in through props, and a click on a
// playable pit is reported through `onPlay`. The viewer's pits run along the
// bottom 1 to 6 towards their store on the right (the CLI's viewer rule).

import { useId, type CSSProperties, type KeyboardEvent } from 'react';
import type { Arrival } from '../animation/steps';
import { opponent, type BoardSnapshot, type Player, type Slot } from '../engine';
import { geometry } from './geometry';
import { seedSpots, type SeedSpot } from './seeds';
import './Board.css';

/** Puzzle feedback on the viewer's pits, 0..5: every pit tried and missed, and the revealed answer. */
export interface PuzzleMarks {
  wrong?: number[];
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
  /** Cups that glow warmly: the ones receiving seeds during the animation. */
  glow?: Slot[];
  /** Seeds on their way during this animation step, drawn flying in on top. */
  arrivals?: Arrival[];
  /** How long a seed takes to fly from cup to cup, in ms. */
  travelMs?: number;
  /** Changes with every animation step, so the flight starts again. */
  stepKey?: number;
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
  glow = [],
  arrivals = [],
  travelMs = 0,
  stepKey = 0,
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

  const same = (a: { player: Player; place: number | 'store' }, b: Slot) =>
    a.player === b.player && a.place === b.place;
  const placeOf = (slot: Slot) => cups.find((c) => same(c, slot))!;
  const countOf = (slot: Slot) =>
    slot.place === 'store' ? board.stores[slot.player] : board.pits[slot.player][slot.place];

  /** One seed, drawn at `spot` relative to the point (x, y). */
  const seedShape = (spot: SeedSpot, x: number, y: number, key: number | string) => (
    <g key={key} data-seed="" transform={`translate(${fixed(x + spot.x)} ${fixed(y + spot.y)}) rotate(${spot.rotate})`}>
      <ellipse rx={fixed(spot.rx)} ry={fixed(spot.ry)} fill={url(spot.alt ? 'seed-alt' : 'seed')} />
      {spot.scar && (
        <ellipse
          className="scar"
          cx={fixed(spot.rx * 0.24 + s(2))}
          cy={fixed(-spot.ry * 0.16 + s(1.5))}
          rx={fixed(s(2))}
          ry={fixed(s(1.5))}
        />
      )}
    </g>
  );

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
        <filter id={id('glow-soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={s(3)} />
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
            {pit !== null && marks.wrong?.includes(pit) && (
              <circle className="mark-wrong" cx={c.x} cy={c.y} r={0.55 * D - s(2)} strokeWidth={s(4)} />
            )}
            {pit !== null && pit === marks.reveal && (
              <g className="mark-reveal">
                <circle cx={c.x} cy={c.y} r={0.55 * D + s(6)} strokeWidth={s(16)} filter={url('glow')} />
                <circle cx={c.x} cy={c.y} r={0.55 * D + s(2)} strokeWidth={s(4)} />
              </g>
            )}
            <circle className="focus-ring" cx={c.x} cy={c.y} r={0.5 * D + s(5)} strokeWidth={s(3)} />

            {glow.some((slot) => same(c, slot)) && (
              <circle className="receiving" cx={c.x} cy={c.y} r={D / 2 + s(3)} strokeWidth={s(7)} filter={url('glow-soft')} />
            )}
            <circle className="cup" cx={c.x} cy={c.y} r={D / 2} />
            <circle cx={c.x} cy={c.y} r={D / 2} fill={url('hollow')} />
            <circle className="lip" cx={c.x} cy={c.y} r={D / 2} strokeWidth={s(2)} />

            <g filter={url('seed-shadow')}>
              {/* Seeds still in flight are drawn on top instead (below). */}
              {seedSpots(count, key, D)
                .slice(0, count - (arrivals.find((a) => same(c, a.to))?.from.length ?? 0))
                .map((spot, n) => seedShape(spot, c.x, c.y, n))}
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

      {/* Seeds in flight: each starts at the cup it left and settles into its
          place in the receiving cup. The key restarts the flight every step. */}
      {arrivals.length > 0 && (
        <g key={stepKey} className="arriving" filter={url('seed-shadow')}>
          {arrivals.flatMap((arrival) => {
            const target = placeOf(arrival.to);
            const spots = seedSpots(countOf(arrival.to), seedKey(arrival.to.player, arrival.to.place), D);
            const first = spots.length - arrival.from.length;
            return arrival.from.map((source, n) => {
              const start = placeOf(source);
              const spot = spots[first + n];
              const style = {
                '--dx': `${fixed(start.x - (target.x + spot.x))}px`,
                '--dy': `${fixed(start.y - (target.y + spot.y))}px`,
                animationDuration: `${travelMs}ms`,
                // A gather sends its seeds one just after another, like a handful poured.
                animationDelay: `${Math.round(n * Math.min(25, travelMs / 4 / arrival.from.length))}ms`,
              } as CSSProperties;
              return (
                <g key={`${arrival.to.player}-${arrival.to.place}-${n}`} className="flying" style={style}>
                  {seedShape(spot, target.x, target.y, 'seed')}
                </g>
              );
            });
          })}
        </g>
      )}
    </svg>
  );
}
