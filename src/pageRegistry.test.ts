import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The registry is read as text: importing it would load every page and the 3D engine just to list names.
const registry = readFileSync(join(__dirname, 'pageRegistry.ts'), 'utf8');
const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8');

const loaderNames = [...registry.matchAll(/^ {2}([A-Za-z]+): \(\) => import\(/gm)].map((m) => m[1]!);
const listed = (kind: string) => {
  const m = new RegExp(`${kind}: \\[([^\\]]+)\\]`).exec(registry);
  return [...(m?.[1] ?? '').matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]!);
};
/** The components each set of routes renders. */
const routesOf = (fn: string) => {
  const body = new RegExp(`function ${fn}\\(\\)[\\s\\S]*?\\n}\\n`).exec(app)?.[0] ?? '';
  return [...new Set([...body.matchAll(/<([A-Z][A-Za-z]+)[\s/>]/g)].map((m) => m[1]!).filter((n) => loaderNames.includes(n)))];
};

describe('every page loads on demand and is fetched ahead for whoever can reach it', () => {
  it('finds the pages', () => {
    expect(loaderNames.length).toBeGreaterThan(25);
  });

  it('only preloads pages that exist', () => {
    for (const kind of ['staff', 'member', 'platform']) for (const name of listed(kind)) expect(loaderNames).toContain(name);
  });

  it('preloads every page a team member can open', () => {
    const missing = routesOf('StaffRoutes').filter((n) => !listed('staff').includes(n));
    expect(missing).toEqual([]);
  });

  it('preloads every page a member can open', () => {
    expect(routesOf('MemberRoutes').filter((n) => !listed('member').includes(n))).toEqual([]);
  });

  it('preloads every page the platform admin can open', () => {
    expect(routesOf('PlatformRoutes').filter((n) => !listed('platform').includes(n))).toEqual([]);
  });

  it('imports no page eagerly in App, apart from sign-in', () => {
    const eager = [...app.matchAll(/^import (\w+)[^;]* from '\.\/pages\/([^']+)';/gm)].map((m) => m[2]);
    expect(eager).toEqual(['Login']);
  });
});
