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
    });
    formatters.set(key, f);
  }
  return f;
}

/** Whole amounts show without decimals ("Rs 1,500"); amounts with paisa or cents show two. */
export const money = (cents: number, currency: string) => formatter(currency, cents % 100 === 0 ? 0 : 2).format(cents / 100);

/** Whole-unit display for large dashboard figures. */
export const moneyWhole = (cents: number, currency: string) => formatter(currency, 0).format(cents / 100);

/** Parses user-typed money ("12", "12.5", "1,200.00") into cents, or null when invalid. */
export function toCents(input: string): number | null {
  const clean = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
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

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
