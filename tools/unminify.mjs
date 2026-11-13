#!/usr/bin/env node
// Turns a crash's stack from the play stats dashboard's ERRORS (the minified build's file:line:col) into the source's.
//
//   node tools/unminify.mjs <maps-folder> [stack.txt]      (the stack from a file, or pasted into stdin)
//
// The maps come from CI: each run of the android workflow keeps the build's source maps as the download
// "corner-cutters-sourcemaps" (the web build's, and "-play" for the Google Play build's), made with
// VITE_SOURCEMAPS=1 and so matching the shipped files exactly (same hashed names). Unzip one and pass its assets
// folder (the one holding app-XXXX.js.map). The error's version (0.2.22+abc1234) names the commit, so the run.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { SourceMapConsumer } from 'source-map-js';

const [dir, file] = process.argv.slice(2);
if (!dir || !existsSync(dir)) {
  console.error('usage: node tools/unminify.mjs <maps-folder> [stack.txt]  (the stack on stdin without a file)');
  process.exit(1);
}
const stack = readFileSync(file ?? 0, 'utf8');
const maps = new Map();
const consumer = (name) => {
  if (!maps.has(name)) {
    const path = [join(dir, `${name}.map`), join(dir, 'assets', `${name}.map`)].find(existsSync);
    maps.set(name, path ? new SourceMapConsumer(JSON.parse(readFileSync(path, 'utf8'))) : undefined);
  }
  return maps.get(name);
};

// a frame: some/path/name.js:line:col (the page's own address is left out of what the dashboard keeps)
const out = stack.replace(/([\w./-]*?([\w.-]+\.js)):(\d+):(\d+)/g, (whole, _path, name, line, col) => {
  const map = consumer(name);
  if (!map) return `${whole}  (no map for ${name}: ${readdirSync(dir).filter((f) => f.endsWith('.map')).length} maps in ${basename(dir)})`;
  const at = map.originalPositionFor({ line: Number(line), column: Number(col) - 1 });
  return at.source ? `${at.source.replace(/^.*?(src\/|node_modules\/)/, '$1')}:${at.line}:${(at.column ?? 0) + 1}${at.name ? ` (${at.name})` : ''}` : whole;
});
console.log(out);
