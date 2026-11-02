const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    // Pakistani rupees read as "Rs 1,500" under en-PK; everything else uses en-US.
    f = new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      // A small negative amount that rounds to nothing reads "Rs 0", never "-Rs 0".
      signDisplay: 'negative',
    });
    formatters.set(key, f);
  }
  return f;
}

/** Whole amounts show without decimals ("Rs 1,500"); amounts with paisa or cents show two. */
export const money = (cents: number, currency: string) => formatter(currency, cents % 100 === 0 ? 0 : 2).format(cents / 100);

/** Whole-unit display for large dashboard figures. */
export const moneyWhole = (cents: number, currency: string) => formatter(currency, 0).format(cents / 100);

/** The largest amount anyone may type, in whole rupees or dollars. Anything bigger is a typing mistake. */
export const MAX_MAJOR_UNITS = 100_000_000;

/**
 * Digits as some keyboards type them, turned into plain ones: full-width (０１２), Arabic-Indic (٠١٢) and the Urdu
 * forms (۰۱۲), with their commas and decimal points.
 */
export function plainDigits(input: string) {
  return input
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[，٬،]/g, ',')
    .replace(/[．٫]/g, '.');
}

/**
 * Parses user-typed money ("12", "12.5", "1,200.00", "１２") into cents, or null when it is not an amount or is more
 * than MAX_MAJOR_UNITS. Worked out in whole numbers, so no floating point rounding is involved.
 */
export function toCents(input: string): number | null {
  const clean = plainDigits(input).replace(/[,\s]/g, '');
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(clean);
  if (!m) return null;
  const whole = Number(m[1]);
  const cents = Number((m[2] ?? '').padEnd(2, '0'));
  if (whole > MAX_MAJOR_UNITS || (whole === MAX_MAJOR_UNITS && cents > 0)) return null;
  return whole * 100 + cents;
}

export const fromCents = (cents: number) => (cents / 100).toFixed(2);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const KIND_LABEL = {
  room: 'Meeting room',
  corporate_room: 'Corporate room',
  hot_desk: 'Hot desk',
  dedicated_desk: 'Dedicated desk',
  office: 'Private office',
  storage: 'Locker, mailbox or parking',
} as const;

export const METHOD_LABEL = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  cheque: 'Cheque',
  other: 'Other',
} as const;

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** A plain number such as "-1500.00" can never run as a formula, so it is left alone and stays a number in the spreadsheet. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
/** What a spreadsheet treats as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, safe to open in Excel or Sheets: anything that could start a formula is turned into text, and quotes are escaped. */
export function csvCell(v: string | number | null | undefined) {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The file's text. It starts with a byte order mark so Excel reads Urdu and other non-Latin text as UTF-8. */
export const toCsv = (rows: (string | number | null | undefined)[][]) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
