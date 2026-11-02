import { describe, expect, it } from 'vitest';
import { rateOf } from './spaceState';

describe('the price shown on a space', () => {
  it('is the hourly price, for any kind of space that has one', () => {
    expect(rateOf({ hourlyRateCents: 150_000 }, 'PKR')?.replace(/ /g, ' ')).toBe('Rs 1,500 an hour');
    expect(rateOf({ hourlyRateCents: 250 }, 'USD')).toBe('$2.50 an hour');
  });

  it('never shows a day rate: the server has none any more', () => {
    expect(rateOf({ hourlyRateCents: 20_000 }, 'PKR')).not.toMatch(/a day/);
  });

  it('is nothing for a space without a price, or without a currency', () => {
    expect(rateOf({ hourlyRateCents: 0 }, 'PKR')).toBeUndefined();
    expect(rateOf({ hourlyRateCents: 150_000 }, undefined)).toBeUndefined();
  });
});
