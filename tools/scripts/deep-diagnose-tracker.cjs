#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(process.cwd());
const API_SRC = path.join(ROOT, "apps", "api", "src");
const CANDIDATES = [
  // Legacy location some scanners expect
  path.join(API_SRC, "router", "tracker.router.ts"),
  path.join(API_SRC, "router", "tracker.router.js"),
  // New, real location
  path.join(API_SRC, "trpc", "routers", "tracker.router.ts"),
  path.join(API_SRC, "trpc", "routers", "tracker.router.tsx"),
  path.join(API_SRC, "trpc", "routers", "tracker.router.js"),
  path.join(API_SRC, "trpc", "routers", "tracker.router.mjs"),
];

/** small helpers */
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const exists = (p) => fs.existsSync(p);
const rel = (p) => path.relative(ROOT, p).replaceAll(path.sep, "/");

function color(s, c) {
  const map = { gray: 90, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36 };
  return `\x1b[${map[c] || 0}m${s}\x1b[0m`;
}

function snippet(source, start, end) {
  const before = Math.max(0, start - 120);
  const after = Math.min(source.length, end + 120);
  const s = source.slice(before, after).replace(/\t/g, "  ");
  return (before > 0 ? "…" : "") + s + (after < source.length ? "…" : "");
}

/** Try to resolve a module specifier the way TS/Node would for typical project files */
function resolveModule(fromFile, spec) {
  if (!spec || /^[a-z@]/i.test(spec)) return null; // bare import; ignore
  const base = path.resolve(path.dirname(fromFile), spec);
  const exts = ["", ".ts", ".tsx", ".js", ".mjs", ".cjs"];
  for (const ext of exts) {
    const p = base + ext;
    if (exists(p)) return p;
  }
  // index files
  for (const ext of ["/index.ts", "/index.tsx", "/index.js"]) {
    const p = base + ext;
    if (exists(p)) return p;
  }
  return null;
}

/** Analyze one file’s AST for how `trackerRouter` is exported */
function analyzeFile(filePath) {
  const sourceText = read(filePath);
  if (!sourceText) return { filePath, exists: false };

  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ESNext, true);
  /** @type {Array<{
   * kind: 'var'|'namedExport'|'exportAll'|'reexport'|'exportAssignment';
   * name?: string;
   * from?: string;
   * resolvedFrom?: string|null;
   * pos: number; end: number
   * }>} */
  const exports = [];
  let hasAnyExportConstTracker = false;

  function record(node, payload) {
    exports.push({ pos: node.getStart(), end: node.getEnd(), ...payload });
  }

  sf.forEachChild(function walk(node) {
    // export const trackerRouter = ...
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      node.declarationList.declarations.forEach((d) => {
        if (ts.isIdentifier(d.name) && d.name.text === "trackerRouter") {
          hasAnyExportConstTracker = true;
          record(node, { kind: "var", name: "trackerRouter" });
        }
      });
    }

    // export { trackerRouter } from '...'
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      const names = node.exportClause.elements.map((e) => ({
        name: e.name.text,
        orig: (e.propertyName || e.name).text,
      }));
      const has = names.find((n) => n.name === "trackerRouter");
      if (has) {
        const from = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : null;
        record(node, { kind: "reexport", name: "trackerRouter", from });
      }
    }

    // export * from '...'
    if (ts.isExportDeclaration(node) && !node.exportClause) {
      const from = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : null;
      record(node, { kind: "exportAll", from });
    }

    // export = something (CommonJS style)
    if (ts.isExportAssignment(node)) {
      record(node, { kind: "exportAssignment" });
    }

    ts.forEachChild(node, walk);
  });

  return {
    filePath,
    exists: true,
    hasAnyExportConstTracker,
    exports,
    sourceText,
  };
}

/** Follow re-exports to find the defining file (up to maxDepth) */
function chaseTracker(startFile, maxDepth = 6) {
  const visited = new Set();
  let queue = [{ file: startFile, depth: 0, via: null }];

  /** results path taken */
  const trail = [];

  while (queue.length) {
    const { file, depth, via } = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const info = analyzeFile(file);
    trail.push({ file, via, info });

    if (!info.exists) continue;
    if (info.hasAnyExportConstTracker) {
      return { resolvedFile: file, reason: "export const trackerRouter …", trail };
    }

    if (depth >= maxDepth) continue;

    // Follow any named re-export of trackerRouter
    for (const ex of info.exports) {
      if ((ex.kind === "reexport" || ex.kind === "exportAll") && ex.from) {
        const next = resolveModule(file, ex.from);
        queue.push({ file: next, depth: depth + 1, via: { kind: ex.kind, from: ex.from, file } });
      }
    }
  }

  return { resolvedFile: null, reason: "Could not find a concrete `export const trackerRouter`", trail };
}

/** Pretty print outcome + JSON if requested */
function main() {
  const wantJson = process.argv.includes("--json");
  const report = {
    checkedCandidates: CANDIDATES.map(rel),
    foundFiles: [],
    tracker: {
      legacyPathExists: exists(CANDIDATES[0]) || exists(CANDIDATES[1]),
      realPathExists:
        exists(path.join(API_SRC, "trpc", "routers", "tracker.router.ts")) ||
        exists(path.join(API_SRC, "trpc", "routers", "tracker.router.js")),
      chase: null,
    },
    hints: [],
  };

  console.log(color("▶ deep-diagnose-tracker", "cyan"));
  console.log(color("repo root: ", "gray") + rel(ROOT));
  console.log(color("candidates:", "gray"), report.checkedCandidates);

  // First, collect any file that even mentions trackerRouter
  const considered = [];
  for (const p of CANDIDATES) {
    if (exists(p)) {
      report.foundFiles.push(rel(p));
      considered.push(p);
    }
  }

  if (considered.length === 0) {
    console.log(color("• No candidate files exist at expected paths.", "red"));
    report.hints.push("Create a shim at apps/api/src/router/tracker.router.ts that re-exports or aliases your real router.");
    finish(report, wantJson);
    return;
  }

  // Chase from each candidate until we find a real `export const trackerRouter`
  let final = null;
  for (const start of considered) {
    const chase = chaseTracker(start);
    if (!report.tracker.chase) report.tracker.chase = [];
    report.tracker.chase.push({
      start: rel(start),
      resolvedFile: chase.resolvedFile ? rel(chase.resolvedFile) : null,
      reason: chase.reason,
      trail: chase.trail.map((t) => ({
        file: rel(t.file),
        via: t.via ? { kind: t.via.kind, from: t.via.from, fromFile: rel(t.via.file) } : null,
        hasAnyExportConstTracker: t.info?.hasAnyExportConstTracker || false,
        exportKinds: t.info?.exports?.map((e) => e.kind) || [],
      })),
    });

    if (chase.resolvedFile) {
      final = chase;
      console.log(color(`✓ Found concrete export in ${rel(chase.resolvedFile)}`, "green"));
      break;
    }
  }

  if (!final) {
    console.log(color("✗ Did not find a concrete `export const trackerRouter` symbol.", "red"));
    console.log(color("Why this matters:", "gray"), "some scanners look specifically for that literal declaration.");
    report.hints.push("Add: `export const trackerRouter = realTrackerRouter;` in your shim so the literal exists.");
  }

  // Print verbose details
  console.log("");
  console.log(color("— Details —", "blue"));
  for (const entry of report.tracker.chase || []) {
    console.log(color(`Start: ${entry.start}`, "magenta"));
    for (const hop of entry.trail) {
      const tag = hop.hasAnyExportConstTracker ? color("[HAS export const trackerRouter]", "green") : color("[no literal export const]", "yellow");
      const via = hop.via ? `  via ${hop.via.kind} from "${hop.via.from}" (in ${hop.via.fromFile})` : "";
      console.log(`  ↳ ${rel(hop.file)}  ${tag}${via}`);
    }
    console.log(color(`Result: ${entry.resolvedFile || "not resolved"}`, entry.resolvedFile ? "green" : "red"));
    console.log("");
  }

  // If we found the file, show a small source snippet
  if (final?.resolvedFile) {
    const info = analyzeFile(final.resolvedFile);
    const node = info.exports.find((e) => e.kind === "var" && info.sourceText.slice(e.pos, e.end).includes("trackerRouter"));
    if (node) {
      console.log(color("Snippet of the concrete export:", "gray"));
      console.log(snippet(info.sourceText, node.pos, node.end));
    }
  }

  finish(report, wantJson);
}

function finish(report, wantJson) {
  if (wantJson) {
    console.log("\n" + JSON.stringify(report, null, 2));
  } else {
    console.log(color("\nDone.", "gray"));
    console.log(color("Tip:", "gray"), "Run with --json to dump a machine-readable report.");
  }
}

main();
