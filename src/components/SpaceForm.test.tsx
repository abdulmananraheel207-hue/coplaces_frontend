// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Location, Resource } from '../types';

const LOC: Location = { id: 'loc', name: 'Nest Clifton', code: 'NC', address: '', timezone: 'Asia/Karachi', currency: 'PKR', openTime: '09:00', closeTime: '21:00', taxRateBps: 0, closedWeekdays: '', active: true };

const sent: { method: string; path: string; body: unknown }[] = [];
vi.mock('../api', () => ({
  api: {
    get: vi.fn(async () => []),
    post: vi.fn(async (path: string, body: unknown) => (sent.push({ method: 'post', path, body }), { id: 'new' })),
    patch: vi.fn(async (path: string, body: unknown) => (sent.push({ method: 'patch', path, body }), {})),
    put: vi.fn(),
    del: vi.fn(),
  },
  API_URL: '/api',
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong'),
}));
vi.mock('../auth', () => ({ useLocation: () => LOC }));

const { SpaceForm } = await import('./SpaceForm');
const { ToastProvider } = await import('./toast');

const room = (o: Partial<Resource> = {}): Resource => ({
  id: 'r1',
  locationId: 'loc',
  kind: 'room',
  name: 'Huddle Room 1',
  floor: '1',
  capacity: 4,
  creditsAllowed: false,
  hourlyRateCents: 150_000,
  amenities: '',
  status: 'available',
  notes: '',
  style: 'huddle',
  planX: null,
  planZ: null,
  planW: null,
  planD: null,
  planRot: 0,
  description: '',
  openTime: null,
  closeTime: null,
  closedWeekdays: null,
  photoIds: [],
  ...o,
});

function show(initial?: Resource, kind: Resource['kind'] = 'room') {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SpaceForm initial={initial} kind={kind} onDone={() => undefined} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Words that only ever labelled a price box. */
const PRICE_WORDS = /hourly rate|day rate|no plan|off-peak|peak from|peak until|half-day|day pass|outside peak/i;

afterEach(() => {
  cleanup();
  sent.length = 0;
});

describe('the space form has no price boxes', () => {
  for (const kind of ['room', 'corporate_room', 'hot_desk', 'dedicated_desk', 'office', 'storage'] as const) {
    it(`offers no price to type for a new ${kind.replace('_', ' ')}`, () => {
      show(undefined, kind);
      expect(document.body.textContent).not.toMatch(PRICE_WORDS);
    });
  }

  it('offers no price to type when editing a room', () => {
    show(room());
    expect(document.body.textContent).not.toMatch(PRICE_WORDS);
  });

  it('shows the price the space has, read only, and where prices are kept', () => {
    show(room({ hourlyRateCents: 150_000 }));
    expect(document.body.textContent).toContain('an hour');
    expect(document.body.textContent).toContain('1,500');
    expect(document.body.textContent).toContain('Prices are set on the Pricing and credit hours page, not on the space.');
  });

  it('says plainly when a space has no price and cannot be booked by the hour', () => {
    show(room({ hourlyRateCents: 0 }));
    expect(document.body.textContent).toContain('No hourly price, so it cannot be booked by the hour.');
  });

  it('never sends a price when saving a change', async () => {
    show(room());
    fireEvent.click(screen.getByRole('button', { name: 'Save space' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const body = sent[0]!.body as Record<string, unknown>;
    expect(sent[0]!.path).toBe('/resources/r1');
    for (const key of ['hourlyRateCents', 'dailyRateCents', 'offPeakRateCents', 'peakStart', 'peakEnd', 'halfDayRateCents', 'fullDayRateCents', 'noPlanRateCents']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body).toMatchObject({ name: 'Huddle Room 1', capacity: 4 });
  });

  it('never sends a price when adding a space', async () => {
    show(undefined, 'hot_desk');
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Hot Desk 9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save space' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const body = sent[0]!.body as Record<string, unknown>;
    expect(sent[0]!.path).toBe('/resources');
    expect(Object.keys(body).filter((k) => /rate|peak/i.test(k))).toEqual([]);
    expect(body).toMatchObject({ name: 'Hot Desk 9', kind: 'hot_desk', locationId: 'loc' });
  });

  it('keeps opening hours for rooms and hot desks only', () => {
    show(undefined, 'hot_desk');
    expect(document.body.textContent).toContain('Opening hours');
    cleanup();
    show(undefined, 'office');
    expect(document.body.textContent).not.toContain('Opening hours');
  });
});
