// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmButton, ErrorNote } from './ui';

afterEach(cleanup);

describe('ConfirmButton', () => {
  it('asks in place and acts only on Yes', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton question="Void INV-1? Its bookings become billable again." yes="Yes, void it" onConfirm={onConfirm}>
        Void invoice
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Void invoice' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Void INV-1? Its bookings become billable again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, void it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Void invoice' })).toBeTruthy();
  });

  it('does nothing when Keep is pressed', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton question="Delete this expense?" yes="Yes, delete" onConfirm={onConfirm}>
        Delete
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete this expense?')).toBeNull();
  });

  it('cannot be confirmed twice while busy', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton question="Remove this payment?" yes="Yes, remove" busy onConfirm={onConfirm}>
        Remove
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect((screen.getByRole('button', { name: 'Yes, remove' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('never opens the browser confirm box', () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(
      <ConfirmButton question="Sure?" yes="Yes" onConfirm={() => undefined}>
        Go
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('ErrorNote', () => {
  it('shows the message and no button when there is nothing to retry', () => {
    render(<ErrorNote error={new Error('Server unavailable')} />);
    expect(screen.getByRole('alert').textContent).toContain('Server unavailable');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers Try again', () => {
    const onRetry = vi.fn();
    render(<ErrorNote error={new Error('Server unavailable')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('cannot be pressed again while retrying', () => {
    render(<ErrorNote error={new Error('x')} onRetry={() => undefined} retrying />);
    expect((screen.getByRole('button', { name: 'Trying again…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says something even when the error is not an Error', () => {
    render(<ErrorNote error={null} />);
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong');
  });
});
