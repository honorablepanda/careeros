#!/usr/bin/env node
/**
 * Summarize vitest-matrix results as a leaderboard.
 *
 * Looks for the most recent tools/test-logs/vitest-matrix-*/summary.csv
 * (or use --run-dir to point at a specific folder) and prints a ranked table.
 *
 * Examples:
 *   node tools/scripts/vitest-matrix-report.cjs
 *   node tools/scripts/vitest-matrix-report.cjs --top=20
 *   node tools/scripts/vitest-matrix-report.cjs --filter="S0|happy"
 *   node tools/scripts/vitest-matrix-report.cjs --best-only
 *   node tools/scripts/vitest-matrix-report.cjs --markdown
 *   node tools/scripts/vitest-matrix-report.cjs --json
 *   node tools/scripts/vitest-matrix-report.cjs --run-dir tools/test-logs/vitest-matrix-2025-09-23T11-57-54-506Z
 */

const fs = require("fs");
const path = require("path");

const args = parseArgs(process.argv.slice(2));
const LOGS_ROOT = path.join("tools", "test-logs");
const RUN_DIR =
  args["run-dir"] ||
  mostRecentRunDir(LOGS_ROOT, /^vitest-matrix-/) ||
  die(`No vitest-matrix runs found under ${LOGS_ROOT}`);

const csvPath = path.join(RUN_DIR, "summary.csv");
const jsonPath = path.join(RUN_DIR, "summary.json");
if (!exists(csvPath)) die(`Missing summary.csv at ${csvPath}`);

const topN = toInt(args.top, 10);
const filterRe = args.filter ? new RegExp(args.filter, "i") : null;
const bestOnly = hasFlag("--best-only");
const asMarkdown = hasFlag("--markdown");
const asJson = hasFlag("--json");

const rows = readSummaryCsv(csvPath);

// Optional: prefer best from summary.json (if present)
let best = null;
if (exists(jsonPath)) {
  try {
    const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    best = j.best || null;
  } catch {}
}

// filter
let filtered = rows;
if (filterRe) filtered = filtered.filter(r => filterRe.test(r.try_id) || filterRe.test(r.setup) || filterRe.test(r.config));
if (bestOnly) filtered = filtered.filter(r => !!r.succeeded);

// sort: succeeded desc, tests_passed desc, files_passed desc, tests_total desc, duration asc, code asc
filtered.sort((a, b) => {
  if (a.succeeded !== b.succeeded) return a.succeeded ? -1 : 1;
  if (a.tests_passed !== b.tests_passed) return b.tests_passed - a.tests_passed;
  if (a.files_passed !== b.files_passed) return b.files_passed - a.files_passed;
  if (a.tests_total !== b.tests_total) return b.tests_total - a.tests_total;
  if (a.duration_ms !== b.duration_ms) return a.duration_ms - b.duration_ms;
  return a.code - b.code;
});

// output
const limited = Number.isFinite(topN) ? filtered.slice(0, topN) : filtered;

if (asJson) {
  const out = {
    runDir: RUN_DIR,
    bestFromJson: best,
    tries: limited
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

console.log();
console.log(`Run: ${path.normalize(RUN_DIR)} (${rows.length} tries${filterRe ? `, ${limited.length} after filter` : ""})`);
if (best) {
  console.log(`Best (from JSON): ${best.try_id || "(unknown)"} — tests ${best.tests_passed}/${best.tests_total}, files ${best.files_passed}/${best.files_total}, code ${best.code}`);
}
console.log();

const table = limited.map((r, i) => ({
  "#": i + 1,
  try: r.try_id,
  setup: r.setup,
  config: r.config,
  ok: r.succeeded ? "✓" : "✗",
  tests: `${r.tests_passed}/${r.tests_total}`,
  files: `${r.files_passed}/${r.files_total}`,
  code: String(r.code),
  time: fmtMs(r.duration_ms),
  log: path.normalize(r.log),
}));

if (asMarkdown) printMarkdown(table);
else printPrettyTable(table);

process.exit(limited.some(r => r.succeeded) ? 0 : 2);

// ------------------------ helpers ------------------------

function readSummaryCsv(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  const lines = txt.trim().split(/\r?\n/);
  const header = lines.shift();
  // Expected header: try_id,setup,config,code,files_passed,files_failed,files_total,tests_passed,tests_failed,tests_total,duration_ms,succeeded,log
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = splitCsv(line);
    out.push({
      try_id: cols[0],
      setup: cols[1],
      config: cols[2],
      code: toInt(cols[3], 1),
      files_passed: toInt(cols[4], 0),
      files_failed: toInt(cols[5], 0),
      files_total: toInt(cols[6], 0),
      tests_passed: toInt(cols[7], 0),
      tests_failed: toInt(cols[8], 0),
      tests_total: toInt(cols[9], 0),
      duration_ms: toInt(cols[10], 0),
      succeeded: toBool(cols[11]),
      log: cols[12],
    });
  }
  return out;
}

function splitCsv(line) {
  // Our CSV is simple (no quoted commas; logs had commas replaced with ';')
  return line.split(",");
}

function mostRecentRunDir(root, re) {
  if (!exists(root)) return null;
  const kids = fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && re.test(d.name))
    .map(d => ({ name: d.name, mtime: fs.statSync(path.join(root, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return kids[0] ? path.join(root, kids[0].name) : null;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function die(msg) { console.error(msg); process.exit(2); }
function hasFlag(f) { return process.argv.includes(f); }
function toInt(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function toBool(v) { return String(v).trim().toLowerCase() === "true"; }

function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  const rs = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}m ${rs}s`;
}

function printPrettyTable(rows) {
  const cols = Object.keys(rows[0] || { "#": "", try: "", setup: "", config: "", ok: "", tests: "", files: "", code: "", time: "", log: "" });
  const widths = {};
  for (const c of cols) {
    widths[c] = Math.max(c.length, ...rows.map(r => String(r[c]).length));
  }
  const line = (obj) => cols.map(c => String(obj[c]).padEnd(widths[c])).join("  ");
  console.log(line(cols.reduce((o, c) => ((o[c]=c), o), {})));
  console.log(cols.map(c => "-".repeat(widths[c])).join("  "));
  for (const r of rows) console.log(line(r));
  console.log();
  console.log("Tip: pass --markdown for a copy-pastable table, or --json for raw data.");
}

function printMarkdown(rows) {
  const cols = Object.keys(rows[0] || { "#": "", try: "", setup: "", config: "", ok: "", tests: "", files: "", code: "", time: "", log: "" });
  console.log("| " + cols.join(" | ") + " |");
  console.log("| " + cols.map(() => "---").join(" | ") + " |");
  for (const r of rows) {
    console.log("| " + cols.map(c => escapeMd(String(r[c]))).join(" | ") + " |");
  }
  console.log();
  console.log("_Note:_ paths are shown as plain text; open the log you want in your editor.");
}

function escapeMd(s) {
  return s.replace(/\|/g, "\\|");
}

function parseArgs(av) {
  const out = {};
  for (const a of av) {
    const m = /^--([^=]+)=(.+)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
