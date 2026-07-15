import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Scope } from '../pages/Scope';
import { useStore } from '../store/store';

function renderScope(initialEntry = '/scope'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Scope />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useStore.setState({ mode: 'sweep', focusCenterHz: null, scope: null });
});

describe('Scope page', () => {
  it('shows the empty state when not in focus mode', () => {
    useStore.setState({ mode: 'sweep', focusCenterHz: null, scope: null });
    renderScope();
    expect(screen.getByText(/Focus a frequency to start the scope/i)).toBeInTheDocument();
    expect(screen.getByText(/Sweep mode/i)).toBeInTheDocument();
  });

  it('shows the receive-only note', () => {
    renderScope();
    expect(screen.getByText(/Receive-only/i)).toBeInTheDocument();
    expect(screen.getByText(/treated as opaque/i)).toBeInTheDocument();
  });

  it('reflects focus mode and the parked center', () => {
    useStore.setState({ mode: 'focus', focusCenterHz: 433_920_000, scope: null });
    renderScope();
    expect(screen.getByText(/Focus mode/i)).toBeInTheDocument();
    expect(screen.getByText(/433\.9200 MHz/)).toBeInTheDocument();
  });
});
