// A local implementation of the seven gate checks in RULES.txt, run against an output directory:
//
//   node verify-gate.mjs --out out --input /path/to/snapshot.json
//
// dashboard_files, board_file, sorted_by_value, coverage, farm_steps, screenshots and
// dossier_matches. Exit 0 only when all seven pass. Standard library only.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';

const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const TEXT_MAX_BYTES = 65_536;
const SHOT_MAX_BYTES = 524_288;
const DASH_MAX_FILES = 400;
const DASH_MAX_BYTES = 4_194_304;
const DOSSIER_MAX_BYTES = 1_572_864;

function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  const eq = process.argv.find((a) => a.startsWith('--' + name + '='));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const out = arg('out', process.env.MAKEFUN_OUTPUT_DIR ?? 'out');
const inputFile = arg('input', '/input/snapshot.json');

/** Every regular file under `dir`, by relative path, skipping nothing. */
function walk(dir, base = dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const st = statSync(path);
    files.push({ path, rel: relative(base, path), name, isFile: st.isFile(), size: st.size });
    if (st.isDirectory()) files.push(...walk(path, base));
  }
  return files;
}

const HEX = (b) => b.toString(16).padStart(2, '0');

function pngSize(buf) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
  if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1];
    const len = buf.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(at + 5), w: buf.readUInt16BE(at + 7) };
    }
    at += 2 + len;
  }
  return null;
}

/** The first network address in a dashboard file, when it carries one the gate refuses. */
function networkAddress(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.css')) {
    return /https?:\/\//.test(text) ? 'css address' : null;
  }
  if (path.endsWith('.js') || path.endsWith('.mjs')) {
    const spec = /(?:^|[^A-Za-z0-9_$])(?:import|export)\s*(?:[^'"`]*?\sfrom\s*)?['"`](https?:\/\/[^'"`]*)['"`]|require\s*\(\s*['"`](https?:\/\/[^'"`]*)['"`]|import\s*\(\s*['"`](https?:\/\/[^'"`]*)['"`]/g;
    return spec.test(text) ? 'js import specifier' : null;
  }
  if (path.endsWith('.html')) {
    const attr = /=\s*("[^"]*"|'[^']*')/g;
    let m;
    while ((m = attr.exec(text)) !== null) {
      if (/https?:\/\//.test(m[1])) return 'html attribute';
    }
    const styles = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    while ((m = styles.exec(text)) !== null) {
      if (/https?:\/\//.test(m[1])) return 'html style body';
    }
    const scripts = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = scripts.exec(text)) !== null) {
      if (/(?:import|export)[^'"`]*?['"`]https?:\/\//.test(m[1])) return 'html inline import';
    }
  }
  return null;
}

function dashboardFiles() {
  const dir = join(out, 'dashboard');
  if (!existsSync(dir)) return 'dashboard/ is missing';
  const all = walk(dir);
  const files = all.filter((f) => f.isFile);
  const dirs = all.filter((f) => !f.isFile);
  for (const d of dirs) if (d.name.startsWith('.')) return `${d.rel}: a directory starts with a dot`;
  if (!files.some((f) => f.rel === 'index.html')) return 'dashboard/ has no index.html at its root';
  if (!files.some((f) => f.rel.endsWith('.css'))) return 'dashboard/ has no .css file';
  if (!files.some((f) => f.rel.endsWith('.js'))) return 'dashboard/ has no .js file';
  if (files.length > DASH_MAX_FILES) return `${files.length} dashboard files, over ${DASH_MAX_FILES}`;
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > DASH_MAX_BYTES) return `${total} dashboard bytes, over ${DASH_MAX_BYTES}`;
  for (const f of files) {
    if (!IMAGE_NAME.test(f.name)) return `${f.rel}: name is not letters, digits and . _ -`;
    const bad = networkAddress(f.path);
    if (bad !== null) return `${f.rel}: a network address in an ${bad}`;
  }
  return null;
}

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
} catch (err) {
  console.error(`cannot read the snapshot at ${inputFile}: ${err.message}`);
  process.exit(2);
}
const known = new Set(snapshot.protocols.map((p) => p.slug));
const watchlist = snapshot.watchlist;
const boardPath = join(out, 'board.json');

let rows = null;
function boardFile() {
  if (!existsSync(boardPath)) return 'board.json is missing';
  const size = statSync(boardPath).size;
  if (size > 8 * 1024 * 1024) return `board.json is ${size} bytes, over 8 MiB`;
  let raw;
  try {
    raw = JSON.parse(readFileSync(boardPath, 'utf8'));
  } catch (err) {
    return `board.json is not JSON: ${err.message}`;
  }
  rows = Array.isArray(raw) ? raw : raw !== null && typeof raw === 'object' && Array.isArray(raw.rows) ? raw.rows : null;
  if (rows === null) return 'board.json holds no rows array';
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, outside 100..4000`;
  const slugs = new Set();
  for (const r of rows) {
    if (r === null || typeof r !== 'object') return 'a row is not an object';
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) return `bad slug ${JSON.stringify(r.slug)}`;
    if (!known.has(r.slug)) return `slug ${r.slug} is not in the snapshot`;
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
    if (!Number.isInteger(r.rank) || r.rank <= 0) return `${r.slug} has rank ${JSON.stringify(r.rank)}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${JSON.stringify(r.implied_value_usd)}`;
    if (!Array.isArray(r.farm_steps)) return `${r.slug} has no farm_steps array`;
  }
  if (rows.length >= 2) {
    const first = rows[0].implied_value_usd;
    if (rows.every((r) => r.implied_value_usd === first)) return 'every row has the same implied value';
  }
  return null;
}

function sortedByValue() {
  if (rows === null) return 'no board to sort';
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = rows.slice().sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) return `rank ${byRank[i].rank} rises above rank ${byRank[i - 1].rank}`;
    if (byRank[i].implied_value_usd === byRank[i - 1].implied_value_usd) return `ranks ${byRank[i - 1].rank} and ${byRank[i].rank} share $${byRank[i].implied_value_usd}`;
  }
  return null;
}

function coverage() {
  if (rows === null) return 'no board to cover';
  const slugs = new Set(rows.map((r) => r.slug));
  const missing = watchlist.filter((s) => !slugs.has(s));
  return missing.length === 0 ? null : `${missing.length} watchlist slugs missing: ${missing.slice(0, 6).join(', ')}`;
}

function farmSteps() {
  if (rows === null) return 'no board to check';
  for (const r of rows) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} steps`;
    for (const s of r.farm_steps) {
      if (typeof s !== 'string') return `${r.slug} has a non-string step`;
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a step of ${t.length} characters`;
    }
  }
  return null;
}

function screenshots() {
  const dir = join(out, 'screenshots');
  if (!existsSync(dir)) return 'screenshots/ is missing';
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  if (names.length < 3 || names.length > 4) return `${names.length} images, outside 3..4`;
  const dims = [];
  for (const name of names) {
    const path = join(dir, name);
    const st = statSync(path);
    if (!st.isFile()) return `${name} is not a regular file`;
    if (!IMAGE_NAME.test(name)) return `${name}: a name is letters, digits and . _ -`;
    if (st.size > SHOT_MAX_BYTES) return `${name} is ${st.size} bytes, over ${SHOT_MAX_BYTES}`;
    const buf = readFileSync(path);
    const size = pngSize(buf) ?? jpegSize(buf);
    if (size === null) return `${name} is not a whole PNG or JPEG`;
    const long = Math.max(size.w, size.h);
    const short = Math.min(size.w, size.h);
    if (long > 1440) return `${name} is ${size.w}x${size.h}, long side over 1440`;
    if (short < 800) return `${name} is ${size.w}x${size.h}, short side under 800`;
    dims.push(`${name} ${size.w}x${size.h} ${st.size}B`);
  }
  screenshots.detail = dims.join(', ');
  return null;
}

function dossierMatches() {
  const path = join(out, 'dossier.json');
  if (!existsSync(path)) return 'dossier.json is missing';
  const size = statSync(path).size;
  if (size > DOSSIER_MAX_BYTES) return `dossier.json is ${size} bytes, over 1.5 MiB`;
  let expected;
  try {
    expected = buildDossier(out, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: { max: 4, max_bytes: SHOT_MAX_BYTES },
      dashboard: { max_files: DASH_MAX_FILES, max_bytes: DASH_MAX_BYTES },
    });
  } catch (err) {
    return `buildDossier refused the output: ${err.message}`;
  }
  const actual = readFileSync(path);
  if (!actual.equals(expected)) return `dossier.json differs from buildDossier (${actual.length} vs ${expected.length} bytes)`;
  return null;
}

const checks = [
  ['dashboard_files', dashboardFiles],
  ['board_file', boardFile],
  ['sorted_by_value', sortedByValue],
  ['coverage', coverage],
  ['farm_steps', farmSteps],
  ['screenshots', screenshots],
  ['dossier_matches', dossierMatches],
];

let failed = 0;
for (const [name, run] of checks) {
  let detail = null;
  try {
    detail = run();
  } catch (err) {
    detail = `check threw: ${err.stack ?? err.message}`;
  }
  if (detail === null) {
    const extra = name === 'screenshots' ? ` (${screenshots.detail})` : '';
    console.log(`PASS ${name}${extra}`);
  } else {
    failed++;
    console.log(`FAIL ${name}: ${detail}`);
  }
}
console.log(failed === 0 ? '\nall 7 checks pass' : `\n${failed} check${failed === 1 ? '' : 's'} failed`);
process.exit(failed === 0 ? 0 : 1);