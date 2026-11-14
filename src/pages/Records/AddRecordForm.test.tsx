import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRecordForm } from './AddRecordForm';

const TODAY = '2026-11-14';

function setup() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(<AddRecordForm today={TODAY} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel, user };
}

describe('AddRecordForm', () => {
  it('shows accessible errors and focuses the first invalid field when submitted empty', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Save record' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix 2 fields before saving.');
    expect(screen.getByText('Choose a record type.')).toBeInTheDocument();

    const title = screen.getByLabelText(/Title/);
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription(/Enter a title/);
    // The type radios come first, so focus lands there.
    expect(screen.getByRole('radio', { name: 'Visit' })).toHaveFocus();
  });

  it('rejects future dates and invalid costs', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Lab report' }));
    await user.type(screen.getByLabelText(/Title/), 'Lipid profile');
    const date = screen.getByLabelText(/Date/);
    await user.clear(date);
    await user.type(date, '2026-12-01');
    await user.type(screen.getByLabelText(/Cost/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Save record' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(date).toHaveAccessibleDescription("The date can't be in the future.");
    expect(screen.getByLabelText(/Cost/)).toHaveAccessibleDescription(/Enter the cost in rupees/);
    expect(date).toHaveFocus();
  });

  it('clears errors as fields are fixed after a failed submit', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Save record' }));
    await user.type(screen.getByLabelText(/Title/), 'Dermatology follow-up');
    expect(screen.queryByText(/Enter a title/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix 1 field before saving.');
  });

  it('submits trimmed values with a parsed cost', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Prescription' }));
    await user.type(screen.getByLabelText(/Title/), '  Vitamin B12  ');
    await user.type(screen.getByLabelText(/Cost/), '₹1,250');
    await user.type(screen.getByLabelText(/Doctor/), 'Dr. Test');
    await user.click(screen.getByRole('button', { name: 'Save record' }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'prescription',
      title: 'Vitamin B12',
      date: TODAY,
      doctor: 'Dr. Test',
      facility: undefined,
      notes: undefined,
      cost: 1250,
    });
  });

  it('calls onCancel from the cancel button', async () => {
    const { onCancel, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
