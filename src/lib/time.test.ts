import { describe, expect, it } from 'vitest';
import { depositRows } from '../components/ContractPrint';
import { localDateOf, todayIn } from './time';

const KHI = 'Asia/Karachi'; // UTC+5, no daylight saving

describe('dates in the location time zone', () => {
  it('puts a moment just after midnight in Karachi on the Karachi day, not the UTC one', () => {
    // 00:30 on 5 March in Karachi is 19:30 on 4 March in UTC.
    expect(localDateOf('2026-03-04T19:30:00.000Z', KHI)).toBe('2026-03-05');
    expect('2026-03-04T19:30:00.000Z'.slice(0, 10)).toBe('2026-03-04'); // what the old code showed
  });

  it('keeps a moment just before midnight in Karachi on that day', () => {
    // 23:59 on 4 March in Karachi is 18:59 on 4 March in UTC.
    expect(localDateOf('2026-03-04T18:59:59.000Z', KHI)).toBe('2026-03-04');
    expect(localDateOf('2026-03-04T19:00:00.000Z', KHI)).toBe('2026-03-05');
  });

  it('crosses month and year ends correctly', () => {
    expect(localDateOf('2026-01-31T19:00:00.000Z', KHI)).toBe('2026-02-01');
    expect(localDateOf('2025-12-31T19:00:00.000Z', KHI)).toBe('2026-01-01');
  });

  it('gives today in the location, not the browser', () => {
    expect(todayIn(KHI, new Date('2026-03-04T19:00:00.000Z'))).toBe('2026-03-05');
    expect(todayIn('America/New_York', new Date('2026-03-04T19:00:00.000Z'))).toBe('2026-03-04');
  });
});

describe('deposit and advance export', () => {
  const entry = { occurredAt: '2026-03-04T19:30:00.000Z', memberName: 'Hamza', resourceName: null, kind: 'received', method: 'jazzcash', reference: 'TX1', amountCents: 500000 };

  it('dates each movement on the location day', () => {
    expect(depositRows([entry], KHI)[0]).toEqual(['2026-03-05', 'Hamza', '', 'Security deposit received', 'JazzCash', 'TX1', 5000]);
  });

  it('never writes "undefined" for a payment method it does not know', () => {
    expect(depositRows([{ ...entry, method: 'crypto_wallet' }], KHI)[0]![4]).toBe('Crypto wallet');
  });
});
