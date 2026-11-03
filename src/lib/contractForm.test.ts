import { describe, expect, it } from 'vitest';
import { cleanMoney } from './format';
import { spanText } from './time';

describe('contract duration', () => {
  it('counts calendar months and days, both ends included', () => {
    expect(spanText('2026-11-01', '2026-11-30')).toBe('1 month (30 days)');
    expect(spanText('2026-11-04', '2026-12-03')).toBe('1 month (30 days)');
    expect(spanText('2026-11-04', '2026-11-23')).toBe('20 days');
    expect(spanText('2026-11-04', '2026-11-04')).toBe('1 day');
    expect(spanText('2026-01-15', '2026-04-19')).toBe('3 months and 5 days (95 days)');
    expect(spanText('2026-01-01', '2027-02-28')).toBe('1 year and 2 months (424 days)');
    expect(spanText('2026-01-31', '2026-02-27')).toBe('1 month (28 days)'); // month end to month end
    expect(spanText('2026-12-01', '2026-11-30')).toBeNull();
  });
});

describe('money boxes', () => {
  it('keep only a number with up to two decimals', () => {
    expect(cleanMoney('12abc3')).toBe('123');
    expect(cleanMoney('Rs 25,000')).toBe('25000');
    expect(cleanMoney('99.505')).toBe('99.50');
    expect(cleanMoney('1.2.3')).toBe('1.23');
    expect(cleanMoney('-500')).toBe('500');
    expect(cleanMoney('e10')).toBe('10');
    expect(cleanMoney('')).toBe('');
  });
});
