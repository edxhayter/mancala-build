import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newBoard, type BoardSnapshot } from '../engine';
import { Board, type BoardProps } from './Board';

const names = { south: 'You', north: 'AI' };

function renderBoard(props: Partial<BoardProps> = {}) {
  const onPlay = vi.fn();
  const all: BoardProps = {
    board: newBoard(),
    viewer: 'south',
    names,
    playable: [0, 1, 2, 3, 4, 5],
    onPlay,
    ...props,
  };
  const view = render(<Board {...all} />);
  return { ...view, onPlay, props: all };
}

/** The centre of a cup, read from the circle drawn for it. */
function centre(element: HTMLElement) {
  const circle = element.querySelector('circle.cup')!;
  return { x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) };
}

describe('Board', () => {
  // Scenario: Starting position
  it('from South: South along the bottom 1 to 6, store on the right; North on top', () => {
    renderBoard();
    const south = [1, 2, 3, 4, 5, 6].map((n) =>
      screen.getByRole('button', { name: `South pit ${n}, 4 seeds` }),
    );
    const north = [1, 2, 3, 4, 5, 6].map((n) =>
      screen.getByRole('img', { name: `North pit ${n}, 4 seeds` }),
    );
    const southStore = screen.getByRole('img', { name: 'South store, 0 seeds' });
    const northStore = screen.getByRole('img', { name: 'North store, 0 seeds' });

    // South's row is below North's, and runs left to right from pit 1.
    expect(centre(south[0]).y).toBeGreaterThan(centre(north[0]).y);
    const xs = south.map((pit) => centre(pit).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // Each North pit is above the South pit opposite it (pit n faces pit 7 - n).
    expect(centre(north[0]).x).toBe(centre(south[5]).x);
    // South's store on the right, North's on the left.
    expect(centre(southStore).x).toBeGreaterThan(centre(south[5]).x);
    expect(centre(northStore).x).toBeLessThan(centre(south[0]).x);
    // The stores are labelled with their owners' names.
    expect(within(southStore).getByText('You')).toBeInTheDocument();
    expect(within(northStore).getByText('AI')).toBeInTheDocument();
  });

  // Scenario: Playing North
  it('from North: North along the bottom, store on the right', () => {
    renderBoard({ viewer: 'north', board: { ...newBoard(), toMove: 'north' } });
    const north1 = screen.getByRole('button', { name: 'North pit 1, 4 seeds' });
    const north6 = screen.getByRole('button', { name: 'North pit 6, 4 seeds' });
    const south1 = screen.getByRole('img', { name: 'South pit 1, 4 seeds' });
    const northStore = screen.getByRole('img', { name: 'North store, 0 seeds' });
    expect(centre(north1).y).toBeGreaterThan(centre(south1).y);
    expect(centre(north1).x).toBeLessThan(centre(north6).x);
    expect(centre(northStore).x).toBeGreaterThan(centre(north6).x);
  });

  // Scenario: Seeds in the starting position
  it('every pit shows four seeds and the number 4; the stores show 0', () => {
    renderBoard();
    const pits = [
      ...screen.getAllByRole('button', { name: /pit \d, 4 seeds/ }),
      ...screen.getAllByRole('img', { name: /pit \d, 4 seeds/ }),
    ];
    expect(pits).toHaveLength(12);
    for (const pit of pits) {
      expect(pit.querySelectorAll('[data-seed]')).toHaveLength(4);
      expect(pit.querySelector('.count')).toHaveTextContent('4');
    }
    for (const store of screen.getAllByRole('img', { name: /store, 0 seeds/ })) {
      expect(store.querySelectorAll('[data-seed]')).toHaveLength(0);
      expect(store.querySelector('.count')).toHaveTextContent('0');
    }
  });

  it('labels say "1 seed" for one seed', () => {
    const board: BoardSnapshot = { ...newBoard(), stores: { south: 1, north: 0 } };
    renderBoard({ board });
    expect(screen.getByRole('img', { name: 'South store, 1 seed' })).toBeInTheDocument();
  });

  // Scenario: Seeds stay put between moves
  it('redrawing the same position draws every seed in the same place', () => {
    const { container, rerender, props } = renderBoard();
    const placesOf = () =>
      Array.from(container.querySelectorAll('[data-seed]'), (seed) => seed.getAttribute('transform'));
    const before = placesOf();
    rerender(<Board {...props} board={structuredClone(props.board)} />);
    expect(placesOf()).toEqual(before);
  });

  it('clicking a playable pit plays it', async () => {
    const { onPlay } = renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'South pit 3, 4 seeds' }));
    expect(onPlay).toHaveBeenCalledWith(2);
  });

  // Scenario: Empty and opposing pits can't be played
  it("an empty pit and the opponent's pits can't be played", async () => {
    const board: BoardSnapshot = {
      ...newBoard(),
      pits: { south: [4, 4, 0, 4, 4, 4], north: [4, 4, 4, 4, 4, 4] },
    };
    const { onPlay } = renderBoard({ board, playable: [0, 1, 3, 4, 5] });
    const empty = screen.getByRole('button', { name: 'South pit 3, 0 seeds' });
    expect(empty).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: /North/ })).toBeNull();

    await userEvent.click(empty);
    await userEvent.click(screen.getByRole('img', { name: 'North pit 2, 4 seeds' }));
    await userEvent.click(screen.getByRole('img', { name: 'South store, 0 seeds' }));
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('with nothing playable, every pit is disabled and out of the tab order', () => {
    renderBoard({ playable: [] });
    for (const pit of screen.getAllByRole('button')) {
      expect(pit).toHaveAttribute('aria-disabled', 'true');
      expect(pit).toHaveAttribute('tabindex', '-1');
    }
  });

  // Scenario: Keyboard play
  it('Tab to a pit, then Enter or Space plays it', async () => {
    const { onPlay } = renderBoard({ playable: [1, 4] });
    await userEvent.tab(); // the first playable pit: South pit 2
    expect(screen.getByRole('button', { name: 'South pit 2, 4 seeds' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onPlay).toHaveBeenLastCalledWith(1);

    await userEvent.tab(); // next: South pit 5
    await userEvent.keyboard(' ');
    expect(onPlay).toHaveBeenLastCalledWith(4);
  });

  it('puzzle marks: a rust ring on every wrong pit, a glow for reveal', () => {
    const { container } = renderBoard({ marks: { wrong: [2, 5], reveal: 4 } });
    expect(container.querySelectorAll('.mark-wrong')).toHaveLength(2);
    expect(container.querySelectorAll('.mark-reveal')).toHaveLength(1);
    const pit3 = screen.getByRole('button', { name: 'South pit 3, 4 seeds' });
    expect(pit3.querySelector('.mark-wrong')).not.toBeNull();
  });
});

describe('Board without labels', () => {
  it('draws no numbers or names, and has no number bands', () => {
    const { container } = render(
      <Board board={newBoard()} viewer="south" names={names} playable={[]} onPlay={() => {}} cup={36} labels={false} />,
    );
    expect(container.querySelectorAll('text')).toHaveLength(0);
    expect(container.querySelectorAll('[data-seed]')).toHaveLength(48);
  });
});
