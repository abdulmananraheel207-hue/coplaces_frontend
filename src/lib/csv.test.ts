import { describe, expect, it } from 'vitest';
import { csvAmount, csvCell, toCsv } from './format';

describe('CSV cells', () => {
  it('turns anything that could start a formula into text', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+1+2')).toBe("'+1+2");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
    expect(csvCell('\rcmd')).toBe(`"'\rcmd"`);
  });

  it('always prefixes a string that starts like a formula, even when it looks like a number', () => {
    expect(csvCell('-1+cmd')).toBe("'-1+cmd");
    expect(csvCell('-Ali Raza')).toBe("'-Ali Raza");
    expect(csvCell('+92 300 1234567')).toBe("'+92 300 1234567");
    expect(csvCell('@home')).toBe("'@home");
    expect(csvCell('=1')).toBe("'=1");
    expect(csvCell('-1500.00')).toBe("'-1500.00");
    expect(csvCell('-0')).toBe("'-0");
  });

  it('leaves only real numbers alone, negative ones too', () => {
    expect(csvCell(-1500)).toBe('-1500');
    expect(csvCell(-15.5)).toBe('-15.5');
    expect(csvCell(1500.05)).toBe('1500.05');
    expect(csvCell(-0)).toBe('0');
    expect(csvCell('1500.00')).toBe('1500.00'); // no formula character, nothing to do
  });

  it('writes amounts as numbers, so negatives stay numbers in the spreadsheet', () => {
    expect(csvAmount(-150050)).toBe(-1500.5);
    expect(csvCell(csvAmount(-150050))).toBe('-1500.5');
    expect(csvCell(csvAmount(29))).toBe('0.29');
    expect(csvCell(csvAmount(0))).toBe('0');
  });

  it('escapes quotes, commas and newlines', () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell('Lahore, Pakistan')).toBe('"Lahore, Pakistan"');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvCell('plain')).toBe('plain');
  });

  it('writes empty cells for missing values', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
  });

  it('keeps Urdu text and starts the file with a byte order mark', () => {
    const text = toCsv([
      ['Name', 'Amount'],
      ['حمزہ شیخ', '1500.00'],
    ]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1)).toBe('Name,Amount\r\nحمزہ شیخ,1500.00');
  });
});
