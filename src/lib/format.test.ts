import { describe, expect, it } from 'vitest';
import { fromCents, MAX_MAJOR_UNITS, money, moneyWhole, plainDigits, toCents } from './format';

// Intl puts a no-break space between "Rs" and the number; compare with an ordinary one.
const plain = (s: string) => s.replace(/ /g, ' ');

describe('money', () => {
  it('shows whole rupees without paisa and part rupees with two places', () => {
    expect(plain(money(150000, 'PKR'))).toBe('Rs 1,500');
    expect(plain(money(150050, 'PKR'))).toBe('Rs 1,500.50');
    expect(money(150000, 'USD')).toBe('$1,500');
    expect(money(150005, 'USD')).toBe('$1,500.05');
  });

  it('shows zero without a sign', () => {
    expect(plain(money(0, 'PKR'))).toBe('Rs 0');
    expect(plain(money(-0, 'PKR'))).toBe('Rs 0');
    expect(money(-0, 'USD')).toBe('$0');
  });

  it('keeps the sign on real negative amounts', () => {
    expect(plain(money(-150000, 'PKR'))).toBe('-Rs 1,500');
    expect(plain(money(-1, 'PKR'))).toBe('-Rs 0.01');
    expect(money(-250, 'USD')).toBe('-$2.50');
  });

  it('formats large amounts with grouping', () => {
    expect(plain(money(10_000_000_000, 'PKR'))).toBe('Rs 100,000,000');
    expect(money(123_456_789_01, 'USD')).toBe('$123,456,789.01');
  });
});

describe('moneyWhole', () => {
  it('never shows "-Rs 0" for a small negative amount', () => {
    expect(plain(moneyWhole(-40, 'PKR'))).toBe('Rs 0');
    expect(moneyWhole(-40, 'USD')).toBe('$0');
    expect(plain(moneyWhole(-0, 'PKR'))).toBe('Rs 0');
  });

  it('rounds to whole units and keeps the sign beyond half a unit', () => {
    expect(plain(moneyWhole(150049, 'PKR'))).toBe('Rs 1,500');
    expect(plain(moneyWhole(150050, 'PKR'))).toBe('Rs 1,501');
    expect(plain(moneyWhole(-50, 'PKR'))).toBe('-Rs 1');
    expect(moneyWhole(-150000, 'USD')).toBe('-$1,500');
  });

  it('formats zero and large values', () => {
    expect(moneyWhole(0, 'USD')).toBe('$0');
    expect(plain(moneyWhole(10_000_000_000, 'PKR'))).toBe('Rs 100,000,000');
  });
});

describe('toCents', () => {
  it('reads ordinary amounts', () => {
    expect(toCents('12')).toBe(1200);
    expect(toCents('12.5')).toBe(1250);
    expect(toCents('12.50')).toBe(1250);
    expect(toCents('12.')).toBe(1200);
    expect(toCents('1,200.00')).toBe(120000);
    expect(toCents(' 5 ')).toBe(500);
    expect(toCents('0')).toBe(0);
  });

  it('is exact where floating point would not be', () => {
    expect(toCents('0.29')).toBe(29);
    expect(toCents('1.15')).toBe(115);
    expect(toCents('19.99')).toBe(1999);
  });

  it('rejects what is not an amount', () => {
    for (const bad of ['', 'abc', '-1', '.5', '1.005', '1.2.3', '1e5', 'Rs 5']) expect(toCents(bad)).toBeNull();
  });

  it('rejects absurdly large amounts', () => {
    expect(toCents(String(MAX_MAJOR_UNITS))).toBe(10_000_000_000);
    expect(toCents(`${MAX_MAJOR_UNITS}.01`)).toBeNull();
    expect(toCents('100000001')).toBeNull();
    expect(toCents('99999999999999999999')).toBeNull();
  });

  it('reads full-width, Arabic-Indic and Urdu digits', () => {
    expect(toCents('１２３')).toBe(12300);
    expect(toCents('１，２００．５０')).toBe(120050);
    expect(toCents('١٢٣')).toBe(12300);
    expect(toCents('۱۲۳٫۵')).toBe(12350);
    expect(plainDigits('۵۰۰')).toBe('500');
  });
});

describe('fromCents', () => {
  it('writes plain numbers for spreadsheets and form fields', () => {
    expect(fromCents(150050)).toBe('1500.50');
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(-0)).toBe('0.00');
    expect(fromCents(-1)).toBe('-0.01');
  });
});
