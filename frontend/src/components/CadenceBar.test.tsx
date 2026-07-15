import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CadenceBar } from './CadenceBar';

afterEach(cleanup);

describe('CadenceBar regularity verdict', () => {
  it('is Regular when an interval exists and observations >= 4', () => {
    render(<CadenceBar recurrenceIntervalS={300} observationCount={12} />);
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('5 min')).toBeInTheDocument();
    expect(document.querySelector('.cadencebar-dot--regular')).not.toBeNull();
  });

  it('is Emerging when an interval exists and observations are 2-3', () => {
    render(<CadenceBar recurrenceIntervalS={300} observationCount={2} />);
    expect(screen.getByText('Emerging')).toBeInTheDocument();
    expect(document.querySelector('.cadencebar-dot--emerging')).not.toBeNull();
  });

  it('is Irregular when there is no interval', () => {
    render(<CadenceBar recurrenceIntervalS={null} observationCount={9} />);
    expect(screen.getByText('Irregular')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(document.querySelector('.cadencebar-dot--irregular')).not.toBeNull();
  });
});
