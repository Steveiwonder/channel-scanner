import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoTip } from './InfoTip';

afterEach(cleanup);

describe('InfoTip', () => {
  it('renders the label and exposes the explanation as the badge accessible name', () => {
    render(<InfoTip text="Signal-to-noise ratio in dB" label="SNR" />);
    expect(screen.getByText('SNR')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Signal-to-noise ratio in dB' }),
    ).toBeInTheDocument();
  });

  it('reveals the tooltip text when the badge is focused', async () => {
    const user = userEvent.setup();
    render(<InfoTip text="Peak power observed for this channel" />);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Peak power observed for this channel');
    expect(tooltip.className).not.toContain('infotip__bubble--visible');

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Peak power observed for this channel' }),
    ).toHaveFocus();
    expect(screen.getByRole('tooltip').className).toContain('infotip__bubble--visible');
  });
});
