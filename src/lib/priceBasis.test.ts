import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PriceBasis } from '../types';
import { basisNote } from './priceBasis';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('where a booking price came from', () => {
  it('says a hot desk is included in the plan', () => {
    expect(basisNote({ type: 'plan' }, 'PKR', true)).toBe("Included in the member's plan");
    expect(basisNote({ type: 'plan' }, 'PKR', false)).toBe('Included in your plan');
  });

  it('says how much free meeting time covered', () => {
    expect(basisNote({ type: 'minutes', freeMinutes: 30, billableMinutes: 30 }, 'PKR', true)).toBe("30 min covered by the member's free meeting time, the rest charged by the hour");
    expect(basisNote({ type: 'minutes', freeMinutes: 60, billableMinutes: 0 }, 'PKR', false)).toBe('Covered by your free meeting time');
  });

  it('names the shift and where its price is set', () => {
    expect(basisNote({ type: 'shift', name: 'Morning' }, 'PKR', true)).toBe('Morning shift price (set on the shift in Plans)');
  });

  it('gives the hourly price and says it comes from the price list', () => {
    expect(plain(basisNote({ type: 'hourly', rateCents: 150_000 }, 'PKR', true))).toBe('Rs 1,500 an hour (from the price list)');
    expect(basisNote({ type: 'hourly', rateCents: 250 }, 'USD', false)).toBe('$2.50 an hour (from the price list)');
  });

  it('says nothing without a basis', () => {
    expect(basisNote(undefined, 'PKR', true)).toBe('');
  });

  it('says nothing, rather than something wrong, for the old rate-card bases', () => {
    for (const old of [{ type: 'daily', rateCents: 1 }, { type: 'dayshare', rateCents: 1 }, { type: 'rates' }]) {
      expect(basisNote(old as unknown as PriceBasis, 'PKR', true)).toBe('');
    }
  });

  it('never mentions a day rate, peak hours, half days or day passes', () => {
    const all: PriceBasis[] = [{ type: 'plan' }, { type: 'minutes', freeMinutes: 10, billableMinutes: 50 }, { type: 'minutes', freeMinutes: 60, billableMinutes: 0 }, { type: 'shift', name: 'Evening' }, { type: 'hourly', rateCents: 100 }];
    for (const b of all) expect(basisNote(b, 'PKR', true)).not.toMatch(/a day|peak|half-day|day pass|rate card/i);
  });
});

// When the backend repository sits next to this one, check that both list the same bases.
const BACKEND = join(__dirname, '../../../coplaces_backend/src/services/bookings.ts');
describe.skipIf(!existsSync(BACKEND))("the server's price bases", () => {
  it('are exactly the ones this app explains', () => {
    const src = readFileSync(BACKEND, 'utf8');
    // The type runs to the first blank line; its object members contain semicolons of their own.
    const union = /export type PriceBasis =([\s\S]*?)\r?\n[ \t]*\r?\n/.exec(src)?.[1] ?? '';
    const server = [...union.matchAll(/type: '([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(server).toEqual(['hourly', 'minutes', 'plan', 'shift']);
  });
});
