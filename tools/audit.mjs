// CI's dependency audit: `npm audit` at high and above, less the advisories listed here, which have no fixed version
// to move to yet. Each one is a stopgap: take it out as soon as a fixed version ships (then `npm audit fix`, or the
// Dependabot pull request, clears it), and the audit fails on it again if it doesn't.
//   node tools/audit.mjs   (exits 1 on any other high or critical advisory)

import { execFileSync } from 'node:child_process';

/** Advisories let through for now: each with why, and when it was added. */
const ALLOWED = {
  // picomatch <= 4.0.7 (through vite, vitest, tinyglobby, typescript-eslint): no fixed picomatch yet; dev and build
  // tools only, nothing in the game. Added 2026-11-18; remove once a fixed picomatch is out.
  'GHSA-fc5q-39xc-vjpf': 'picomatch, no fixed version yet',
};
const LEVELS = ['high', 'critical'];

let out;
try {
  out = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
} catch (err) {
  // (npm audit exits 1 when it finds anything: its report is still on stdout)
  out = err.stdout;
  if (!out) throw err;
}
const report = JSON.parse(out);
const advisories = new Map();
for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    // (a string is another package the finding comes through: its own advisory is listed under that package)
    if (typeof via !== 'object') continue;
    const id = via.url?.split('/').pop() ?? String(via.source);
    advisories.set(id, { pkg, severity: via.severity, title: via.title, url: via.url });
  }
}
const allowed = [...advisories].filter(([id, a]) => LEVELS.includes(a.severity) && id in ALLOWED);
const failing = [...advisories].filter(([id, a]) => LEVELS.includes(a.severity) && !(id in ALLOWED));
for (const [id, a] of allowed) console.log(`allowed for now: ${id} (${a.pkg}, ${a.severity}): ${ALLOWED[id]}`);
for (const id of Object.keys(ALLOWED)) if (!advisories.has(id)) console.log(`no longer found: ${id}, take it out of ALLOWED in tools/audit.mjs`);
for (const [id, a] of failing) console.log(`::error::${id} (${a.pkg}, ${a.severity}): ${a.title} ${a.url ?? ''}`);
console.log(failing.length ? `${failing.length} high or critical advisories` : 'no high or critical advisories (besides those allowed for now)');
process.exit(failing.length ? 1 : 0);
