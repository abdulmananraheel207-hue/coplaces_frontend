import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FINANCE_KEYS } from './queries';

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The text of every `useMutation({ ... })` call in a file, found by matching brackets. */
function mutations(text: string) {
  const out: string[] = [];
  let at = text.indexOf('useMutation(');
  while (at !== -1) {
    let depth = 0;
    let end = at + 'useMutation'.length;
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    out.push(text.slice(at, end + 1));
    at = text.indexOf('useMutation(', end);
  }
  return out;
}

/** Requests that move money or change what is owed. */
const MONEY = [
  /^\/invoices/,
  /^\/payments\//,
  /^\/expenses/,
  // Adding, changing or deleting a member, and their money, plan or renewal. Not a password reset.
  /^\/members($|\/\$\{[^}]+\}($|\/(money|deposit|renew|plan)$))/,
  /^\/contracts/,
  /^\/amenities\/(orders|collect)/,
  /^\/plans/,
  /^\/shifts/,
];

const CALL = /api\.(post|patch|put|del)(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)/g;

describe('money changes refresh every money figure', () => {
  it('lists every cache that shows money, and not the old unused key', () => {
    for (const key of ['reports', 'dashboard', 'invoices', 'invoice', 'payments', 'expenses', 'members', 'member', 'contracts', 'summary', 'bookings']) {
      expect(FINANCE_KEYS).toContain(key);
    }
    expect(FINANCE_KEYS).not.toContain('finance');
  });

  const found: string[] = [];
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    mutations(text).forEach((block, i) => {
      const paths = [...block.matchAll(CALL)].map((m) => m[2]!);
      const money = paths.filter((p) => MONEY.some((re) => re.test(p)));
      if (!money.length) return;
      const name = `${relative(SRC, file).replace(/\\/g, '/')} mutation ${i + 1} (${money.join(', ')})`;
      found.push(name);
      it(name, () => {
        // Either the list itself, or a list built from it (contract tools keep theirs in REFRESH).
        expect(/\.\.\.(FINANCE_KEYS|REFRESH)\b/.test(block)).toBe(true);
      });
    });
  }

  it('found the money changes it should check', () => {
    expect(found.length).toBeGreaterThanOrEqual(25);
  });

  it('never refreshes the old "finance" key', () => {
    for (const file of sources(SRC)) expect(readFileSync(file, 'utf8')).not.toMatch(/refresh\([^)]*'finance'/);
  });
});
