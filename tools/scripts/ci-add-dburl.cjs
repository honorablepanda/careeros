#!/usr/bin/env node
// Add DATABASE_URL to each job env in selected workflows (idempotent).
const fs = require("fs");
const path = require("path");

const FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/activity-ci.yml",
  ".github/workflows/activity-check.yml",
  ".github/workflows/activity-guard.yml",
];

const LINE = "postgresql://postgres:postgres@localhost:5432/careeros_ci";

function patchFile(file) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return false;
  const src = fs.readFileSync(p, "utf8");
  const lines = src.split(/\r?\n/);
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const envLine = lines[i];
    const m = /^(\s*)env:\s*$/.exec(envLine);
    if (!m) continue;

    const envIndent = m[1];                    // indent of "env:"
    let childIndent = envIndent + "  ";        // guess children indent
    let j = i + 1;
    let hasDB = false;

    // discover actual child indent from first non-empty line after env:
    for (; j < lines.length; j++) {
      const s = lines[j];
      if (!s.trim()) continue;
      const lead = s.match(/^(\s*)/)[1];
      if (lead.length <= envIndent.length) break;      // dedent -> empty env
      childIndent = lead;                               // adopt actual child indent
      break;
    }

    // scan env block until dedent
    for (; j < lines.length; j++) {
      const s = lines[j];
      const lead = s.match(/^(\s*)/)[1];
      if (s.trim() && lead.length <= envIndent.length) break; // end of env block
      if (/^\s*DATABASE_URL:/.test(s)) hasDB = true;
    }

    if (!hasDB) {
      lines.splice(j, 0, `${childIndent}DATABASE_URL: ${LINE}`);
      changed = true;
      i = j; // continue after inserted line
    }
  }

  if (changed) fs.writeFileSync(p, lines.join("\n"));
  return changed;
}

let any = false;
for (const f of FILES) {
  const did = patchFile(f);
  if (did) {
    console.log(`✎ Added DATABASE_URL to ${f}`);
    any = true;
  } else {
    console.log(`• ${f} already ok`);
  }
}
if (!any) console.log("No changes needed.");
