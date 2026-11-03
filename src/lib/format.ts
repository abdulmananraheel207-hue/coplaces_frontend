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

/** An amount for a spreadsheet: a real number in whole units, so it adds up in Excel and a negative is never taken for a formula. */
export const csvAmount = (cents: number) => cents / 100;

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
  bank_transfer: 'Online transfer',
  cheque: 'Cheque',
} as const;

/** The channels in the order they are offered. */
export const METHODS = ['cash', 'card', 'bank_transfer', 'cheque'] as const;

/** A channel's name, or the method stored on an old record (JazzCash and the like became online transfers). */
export const methodName = (m: string | null | undefined) => (m ? ((METHOD_LABEL as Record<string, string>)[m] ?? m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ')) : '');

export const MONEY_STATUS_LABEL = { cleared: 'Cleared', pending: 'Waiting to clear', bounced: 'Bounced' } as const;

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** What a spreadsheet treats as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell, safe to open in Excel or Sheets. Every string that starts like a formula gets a leading quote, whatever
 * follows, so "-1+cmd" or a name typed as "-Ali" can never run. Only values that are numbers in the code are left
 * alone, which is why amounts go into exports through `csvAmount`, never as text.
 */
export function csvCell(v: string | number | null | undefined) {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`;
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

/**
 * What a money box keeps of what was typed: digits and one decimal point with at most two places. Letters, signs, spaces and commas
 * are dropped, so a price can never hold anything that is not a number.
 */
export function cleanMoney(raw: string) {
  const digits = raw.replace(/[^0-9.]/g, '');
  const dot = digits.indexOf('.');
  if (dot === -1) return digits;
  return `${digits.slice(0, dot)}.${digits.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}
