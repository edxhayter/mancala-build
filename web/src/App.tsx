// A placeholder page for task 4.1: it proves the tokens and fonts load.
// Task 6.2 replaces it with the real header, board and status line.
export function App() {
  return (
    <main style={{ padding: '40px 56px', display: 'grid', gap: 22 }}>
      <h1 style={{ fontSize: 48, lineHeight: 1 }}>Mancala</h1>
      <div className="woven-band" aria-hidden="true" />
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 30, margin: 0 }}>Your move</p>
      <p style={{ color: 'var(--ink-soft)', margin: 0 }}>The board arrives in task 6.1.</p>
    </main>
  );
}
