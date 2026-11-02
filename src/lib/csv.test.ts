import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './format';

describe('CSV cells', () => {
  it('turns anything that could start a formula into text', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+1+2')).toBe("'+1+2");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
    expect(csvCell('\rcmd')).toBe(`"'\rcmd"`);
  });

  it('leaves plain numbers as numbers, negative ones too', () => {
    expect(csvCell('-1500.00')).toBe('-1500.00');
    expect(csvCell('1500.00')).toBe('1500.00');
    expect(csvCell(-25)).toBe('-25');
    expect(csvCell(0)).toBe('0');
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
