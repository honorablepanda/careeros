#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const webDir = path.join(root, 'web');

function read(p){ try { return fs.readFileSync(p,'utf8'); } catch { return ''; } }
function exists(p){ try { fs.accessSync(p); return true; } catch { return false; } }

const hits = [];
(function walk(dir){
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes:true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(m?[jt]sx?)$/.test(e.name)) {
      const txt = read(full);
      const lines = txt.split('\n');
      lines.forEach((l, i) => {
        if (/from\s+['"][^'"]*\/trpc(\/react)?['"]/.test(l) || /import\s+.*trpc.*from\s+['"][^'"]*trpc[^'"]*['"]/.test(l)) {
          hits.push({ file: path.relative(root, full), line: i+1, text: l.trim() });
        }
      });
    }
  }
})(webDir);

console.log('▶ imports that mention "/trpc" in web/:');
if (!hits.length) console.log('  (none)');
for (const h of hits) console.log(`  → ${h.file}:${h.line}\n     ${h.text}`);
