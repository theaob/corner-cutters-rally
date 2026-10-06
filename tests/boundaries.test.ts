// The code is split into an engine and the F1 game built on it. These rules
// keep the split honest: the engine never reaches into the game, and F1 uses
// nothing but the engine and itself.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Where each relative import in `file` points, as a path under src/. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specs = [...text.matchAll(/(?:from|import)\s*\(?\s*'(\.[^']+)'/g)].map((m) => m[1]);
  return specs.map((s) => relative(SRC, normalize(join(dirname(file), s))));
}

const outside = (area: string, allowed: string[]) =>
  tsFiles(join(SRC, area)).flatMap((file) =>
    importsOf(file)
      .filter((target) => !allowed.some((a) => target === a || target.startsWith(`${a}/`)))
      .map((target) => `${relative(SRC, file)} -> ${target}`),
  );

describe('code boundaries', () => {
  it('the engine only uses the engine', () => {
    expect(outside('engine', ['engine'])).toEqual([]);
  });

  it('sees the imports it checks', () => {
    expect(importsOf(join(SRC, 'f1', 'race.ts'))).toContain('engine/driving');
    expect(outside('f1', ['f1'])).not.toEqual([]);
  });

  it('F1 only uses the engine and itself', () => {
    expect(outside('f1', ['engine', 'f1'])).toEqual([]);
  });
});
