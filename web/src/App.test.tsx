import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

// Placeholder from task 4.1: proves Vitest, jsdom and React Testing Library work.
describe('App', () => {
  it('shows the title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Mancala' })).toBeInTheDocument();
  });
});
