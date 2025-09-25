#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Vitest Matrix Runner
 *
 * Discovers variant files in:
 *   - tools/vitest-matrix/setup/*.{ts,tsx,js,cjs,mjs}
 *   - tools/vitest-matrix/config/*.{ts,tsx,js,cjs,mjs}
 *   - tools/vitest-matrix/trpc/*.{ts,tsx,js,cjs,mjs}   (optional)
 *
 * For each combination, it copies:
 *   setup -> web/test/setup-tests.ts
 *   config -> web/vitest.config.ts
 *   trpc  -> web/test/trpc.stub.ts (if present)
 *
 * Then runs: pnpm -w test:web
 *
 * Logs stdout/stderr to tools/test-logs/vitest-matrix-<timestamp>/try-XX__... .log
 * Writes CSV & JSON summaries; can --apply-best if success was found.
 *
 * Examples:
 *   node tools/scripts/vitest-matrix.cjs
 *   node tools/scripts/vitest-matrix.cjs --clean-between --heapMB=6144
 *   node tools/scripts/vitest-matrix.cjs --filter="S0|happy" --max=20
 *   node tools/scripts/vitest-matrix.cjs --apply-best
 *   node tools/scripts/vitest-matrix.cjs --help
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ARGS = parseArgs(process.argv.slice(2));
if (ARGS.help || hasFlag("--help")) {
  printHelp();
  process.exit(0);
}

const ROOT = process.cwd();

// --- TARGETS (where we copy to)
const TARGETS = {
  setup: p("web/test/setup-tests.ts"),
  config: p("web/vitest.config.ts"),
  trpc:  p("web/test/trpc.stub.ts"),
};

// --- VARIANT SOURCES (where we read from)
const VAR_DIRS = {
  setup: p("tools/vitest-matrix/setup"),
  config: p("tools/vitest-matrix/config"),
  trpc:  p("tools/vitest-matrix/trpc"),
};

// ensure directories exist (ok if empty)
ensureDir(VAR_DIRS.setup);
ensureDir(VAR_DIRS.config);
ensureDir(VAR_DIRS.trpc);

// discover variants
const setups  = findVariants("S", VAR_DIRS.setup);
const configs = findVariants("C", VAR_DIRS.config);
const trpcs   = findVariants("T", VAR_DIRS.trpc); // optional; can be empty

if (setups.length === 0 || configs.length === 0) {
  bail(`No variants found. Put files under:
  ${VAR_DIRS.setup}
  ${VAR_DIRS.config}
Optionally:
  ${VAR_DIRS.trpc}
Filenames become IDs (prefix S/C/T added automatically).`);
}

// optional filter
const idFilter = ARGS.filter ? new RegExp(ARGS.filter, "i") : null;
const maxTries = toInt(ARGS.max, Infinity);

// run dir
const RUN_DIR = mkRunDir();
const SUMMARY_CSV = path.join(RUN_DIR, "summary.csv");
const SUMMARY_JSON = path.join(RUN_DIR, "summary.json");

// write CSV header
fs.writeFileSync(
  SUMMARY_CSV,
  "try_id,setup,config,trpc,code,files_passed,files_failed,files_total,tests_passed,tests_failed,tests_total,duration_ms,succeeded,log\n",
  "utf8"
);

// backup originals once
const BACKUP_DIR = p(`tools/scripts/.backups/vitest-matrix.${newIsoStamp()}`);
ensureDir(path.dirname(BACKUP_DIR));
backupOnce(TARGETS.setup);
backupOnce(TARGETS.config);
backupOnce(TARGETS.trpc);

// build the matrix
const combos = [];
for (const s of setups) {
  for (const c of configs) {
    // either 1:1 with each trpc, or if none present, include a single null
    if (trpcs.length) {
      for (const t of trpcs) {
        combos.push({ s, c, t });
      }
    } else {
      combos.push({ s, c, t: null });
    }
  }
}

// optional filter / limit
let tries = combos.map((combo, i) => ({
  idx: i + 1,
  try_id: mkTryId(combo, i + 1),
  ...combo,
}));
if (idFilter) {
  tries = tries.filter(t =>
    idFilter.test(t.try_id) ||
    idFilter.test(t.s.id) ||
    idFilter.test(t.c.id) ||
    (t.t && idFilter.test(t.t.id))
  );
}
if (Number.isFinite(maxTries)) {
  tries = tries.slice(0, maxTries);
}

console.log();
console.log(`▶ Vitest matrix: ${tries.length} run(s)`);
console.log(`   setups=${setups.length}, configs=${configs.length}, trpc=${trpcs.length || 0}`);
console.log(`   run dir: ${path.normalize(RUN_DIR)}`);
console.log();

// main loop
const results = [];
for (let i = 0; i < tries.length; i++) {
  const t = tries[i];
  const label = `[${i + 1}/${tries.length}] ${t.try_id}`;
  console.log(`▶ ${label}`);

  try {
    // apply variants
    if (t.s) copyVariant(t.s, TARGETS.setup);
    if (t.c) copyVariant(t.c, TARGETS.config);
    if (t.t) copyVariant(t.t, TARGETS.trpc);

    if (hasFlag("--clean-between") || ARGS.clean) {
      safeRimraf(p("web/node_modules/.vitest"));
      safeRimraf(p("web/node_modules/.vite")); // sometimes helpful
      console.log("   ↳ cleared Vitest cache");
    }

    const before = Date.now();
    const { code, out, err } = runVitest();
    const duration = Date.now() - before;

    const parsed = parseVitest(out + "\n" + err);
    const logPath = path.join(RUN_DIR, `${t.try_id}.log`);
    fs.writeFileSync(logPath, out + "\n" + err, "utf8");

    const succeeded = code === 0 && parsed.tests_total > 0;
    results.push({
      try_id: t.try_id,
      setup: t.s.id,
      config: t.c.id,
      trpc: t.t ? t.t.id : "",
      code,
      ...parsed,
      duration_ms: duration,
      succeeded,
      log: path.normalize(logPath),
    });

    appendCsv(SUMMARY_CSV, results[results.length - 1]);

    // hint first error (best-effort)
    const hint = firstErrorLine(out) || firstErrorLine(err);
    console.log(`   ↳ ${succeeded ? "OK" : "FAIL"}  files ${parsed.files_passed}/${parsed.files_total}, tests ${parsed.tests_passed}/${parsed.tests_total}${hint ? `\n   ↳ first error: ${hint}` : ""}`);

  } catch (e) {
    const duration = 0;
    const out = "";
    const err = String(e && e.stderr ? e.stderr : e && e.message ? e.message : e);
    const logPath = path.join(RUN_DIR, `${t.try_id}.log`);
    fs.writeFileSync(logPath, out + "\n" + err, "utf8");

    results.push({
      try_id: t.try_id,
      setup: t.s.id,
      config: t.c.id,
      trpc: t.t ? t.t.id : "",
      code: 1,
      files_passed: 0,
      files_failed: 0,
      files_total: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_total: 0,
      duration_ms: duration,
      succeeded: false,
      log: path.normalize(logPath),
    });
    appendCsv(SUMMARY_CSV, results[results.length - 1]);
    console.log(`   ↳ CRASH (see ${path.normalize(logPath)})`);
  }
}

// restore or apply best
const best = pickBest(results);
fs.writeFileSync(SUMMARY_JSON, JSON.stringify({ best, results }, null, 2), "utf8");

console.log();
console.log(`▶ Done. Summary: ${path.normalize(SUMMARY_CSV)}`);
console.log("▶ Best result:");
console.log(`   - setup:  ${best.setup}`);
console.log(`   - config: ${best.config}`);
if (best.trpc) console.log(`   - trpc:   ${best.trpc}`);
console.log(`   - files:  ${best.files_passed} / ${best.files_total}`);
console.log(`   - tests:  ${best.tests_passed} / ${best.tests_total}`);
console.log(`   - code:   ${best.code}`);
console.log(`   - ok?:    ${best.succeeded}`);
console.log(`   - log:    ${path.normalize(best.log)}`);

const APPLY = hasFlag("--apply-best") || ARGS["apply-best"];
if (APPLY) {
  if (best.succeeded) {
    console.log("▶ Applying best combo to working tree…");
    applyById("S", best.setup, VAR_DIRS.setup, TARGETS.setup);
    applyById("C", best.config, VAR_DIRS.config, TARGETS.config);
    if (best.trpc) applyById("T", best.trpc, VAR_DIRS.trpc, TARGETS.trpc);
  } else {
    console.log("▶ No successful run to apply (either exit code != 0 or no totals). Keeping originals.");
    restoreOriginals();
  }
} else {
  console.log("▶ Restoring originals (pass --apply-best to keep the winner).");
  restoreOriginals();
}

process.exit(best.succeeded ? 0 : 1);

// ------------------------------- helpers -------------------------------

function p(rel) { return path.join(ROOT, rel); }

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(f => /\.(t|j)sx?$/.test(f));
  } catch {
    return [];
  }
}

function findVariants(prefix, dir) {
  const files = listFiles(dir);
  return files.map((fname) => {
    const id = `${prefix}${normalizeId(fname)}`;
    const full = path.join(dir, fname);
    return { id, file: full };
  });
}

function normalizeId(fname) {
  return fname
    .replace(/\.(t|j)sx?$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function mkTryId({ s, c, t }, nth) {
  const parts = [
    String(nth).padStart(2, "0"),
    s.id,
    c.id,
  ];
  if (t) parts.push(t.id);
  return `try-${parts.join("__")}`;
}

function copyVariant(variant, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(variant.file, dest);
}

function backupOnce(destFile) {
  if (!destFile) return;
  if (!fs.existsSync(destFile)) return;
  const bak = `${destFile}.bak.${newIsoStamp()}`;
  ensureDir(path.dirname(bak));
  fs.copyFileSync(destFile, bak);
  // remember for later restore
  BACKUPS.push({ src: destFile, bak });
}
const BACKUPS = [];

function restoreOriginals() {
  for (const { src, bak } of BACKUPS) {
    try {
      if (fs.existsSync(bak)) fs.copyFileSync(bak, src);
    } catch {}
  }
}

function safeRimraf(target) {
  try {
    if (!fs.existsSync(target)) return;
    if (process.platform === "win32") {
      execSync(`cmd /c rmdir /s /q "${target}"`, { stdio: "ignore" });
    } else {
      execSync(`rm -rf "${target}"`, { stdio: "ignore" });
    }
  } catch {}
}

function runVitest() {
  const heapMB = toInt(ARGS.heapMB, 4096);
  const pool = ARGS.pool || ""; // let config decide by default
  const poolArg = pool ? ` --pool ${pool}` : "";
  const extra = ARGS.vitestArgs ? ` ${ARGS.vitestArgs}` : "";
  // Use the repo's script (which already has cross-env & config wire-up)
  const cmd = `pnpm -w test:web${poolArg}${extra}`;
  const env = { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heapMB}` };
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: "pipe", env });
    return { code: 0, out, err: "" };
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : "";
    const err = e.stderr ? e.stderr.toString() : (e.message || String(e));
    return { code: typeof e.status === "number" ? e.status : 1, out, err };
  }
}

function parseVitest(all) {
  // defaults
  const r = {
    files_passed: 0,
    files_failed: 0,
    files_total: 0,
    tests_passed: 0,
    tests_failed: 0,
    tests_total: 0,
  };

  // Typical lines:
  // "Test Files  1 failed | 38 passed (39)"
  // "Tests  1 failed | 39 passed (40)"
  // or "Test Files  38 passed (38)"
  // or "No test files found, exiting with code 1"
  const lines = String(all).split(/\r?\n/);

  for (const line of lines) {
    let m;
    m = /Test Files\s+(?:(\d+)\s+failed\s+\|\s+)?(?:(\d+)\s+passed)\s+\(\s*(\d+)\s*\)/i.exec(line);
    if (m) {
      r.files_failed = toInt(m[1], 0);
      r.files_passed = toInt(m[2], 0);
      r.files_total  = toInt(m[3], r.files_failed + r.files_passed);
      continue;
    }
    m = /Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(?:(\d+)\s+passed)\s+\(\s*(\d+)\s*\)/i.exec(line);
    if (m) {
      r.tests_failed = toInt(m[1], 0);
      r.tests_passed = toInt(m[2], 0);
      r.tests_total  = toInt(m[3], r.tests_failed + r.tests_passed);
      continue;
    }
  }
  return r;
}

function appendCsv(csvPath, row) {
  const line = [
    row.try_id,
    row.setup,
    row.config,
    row.trpc || "",
    row.code,
    row.files_passed,
    row.files_failed,
    row.files_total,
    row.tests_passed,
    row.tests_failed,
    row.tests_total,
    row.duration_ms,
    row.succeeded,
    row.log.replace(/,/g, ";"),
  ].join(",") + "\n";
  fs.appendFileSync(csvPath, line, "utf8");
}

function pickBest(rows) {
  // succeeded desc, tests_passed desc, files_passed desc, tests_total desc, duration asc, code asc
  const sorted = rows.slice().sort((a, b) => {
    if (a.succeeded !== b.succeeded) return a.succeeded ? -1 : 1;
    if (a.tests_passed !== b.tests_passed) return b.tests_passed - a.tests_passed;
    if (a.files_passed !== b.files_passed) return b.files_passed - a.files_passed;
    if (a.tests_total !== b.tests_total) return b.tests_total - a.tests_total;
    if (a.duration_ms !== b.duration_ms) return a.duration_ms - b.duration_ms;
    return a.code - b.code;
  });
  return sorted[0];
}

function mkRunDir() {
  const root = p("tools/test-logs");
  ensureDir(root);
  const d = path.join(root, `vitest-matrix-${newIsoStamp()}`);
  ensureDir(d);
  return d;
}

function newIsoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function firstErrorLine(txt) {
  const L = String(txt).split(/\r?\n/);
  const hit = L.find(l => /Error[:\s]/.test(l));
  return hit ? hit.trim() : "";
}

function toInt(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function hasFlag(name) { return process.argv.includes(name); }

function parseArgs(av) {
  const out = {};
  for (const a of av) {
    const m = /^--([^=]+)=(.+)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function bail(msg) { console.error(msg); process.exit(2); }

function printHelp() {
  console.log(`
Vitest Matrix Runner

Discovers variants in:
  ${VAR_DIRS.setup}
  ${VAR_DIRS.config}
  ${VAR_DIRS.trpc}  (optional)

Copies them over the working files:
  setup  -> ${TARGETS.setup}
  config -> ${TARGETS.config}
  trpc   -> ${TARGETS.trpc}

Runs "pnpm -w test:web" for each combination, logs to:
  ${path.join("tools","test-logs","vitest-matrix-<stamp>")}

Flags:
  --clean-between         Remove web/node_modules/.vitest and .vite between runs
  --heapMB=6144           Max old space for vitest process (default 4096)
  --pool=forks|threads    Forward a pool choice (optional; config can decide)
  --vitestArgs="..."      Extra args appended to test command
  --filter="regex"        Only run combos whose IDs match the regex
  --max=20                Limit number of combos
  --apply-best            Keep the best combo in your working tree
  --help                  Show this message

Pro tip:
  Use "node tools/scripts/vitest-matrix-report.cjs" afterwards to rank results.
`);
}

function applyById(prefix, id, srcDir, dest) {
  const file = findById(prefix, id, srcDir);
  if (!file) throw new Error(`Could not find variant ${id} under ${srcDir}`);
  fs.copyFileSync(file, dest);
}

function findById(prefix, id, srcDir) {
  const base = id.replace(new RegExp("^" + prefix), "");
  const files = listFiles(srcDir);
  const match = files.find(f => normalizeId(f) === base);
  return match ? path.join(srcDir, match) : null;
}
