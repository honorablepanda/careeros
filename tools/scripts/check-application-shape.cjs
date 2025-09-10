#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';

const prismaPath = path.join(ROOT, 'prisma', 'schema.prisma');
const routerPath = path.join(ROOT, 'apps', 'api', 'src', 'trpc', 'routers', 'tracker.router.ts');
const pagePath   = path.join(ROOT, 'web', 'src', 'app', 'tracker', 'page.tsx');

function parseApplicationFields(schema) {
  const out = new Set();
  const start = schema.indexOf('model Application');
  if (start === -1) return out;
  const body = schema.slice(start);
  const open = body.indexOf('{');
  if (open === -1) return out;
  let i = open + 1, depth = 1;
  for (; i < body.length && depth > 0; i++) {
    const ch = body[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  const section = body.slice(open + 1, i - 1);
  section.split('\n').forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith('@@') || l.startsWith('//')) return;
    const [name, type] = l.split(/\s+/);
    if (!name || !type) return;
    // Skip relation-only lines
    if (type.includes('[]')) out.add(name);
    else out.add(name);
  });
  return out;
}

function findRouterDataKeys(src) {
  // naive but effective: capture keys inside create({ data: { ... } }) and update({ data: { ... } })
  const keys = new Set();
  const regex = /(?:create|update)\s*\(\s*{[\s\S]*?data\s*:\s*{([\s\S]*?)}/g;
  let m;
  while ((m = regex.exec(src))) {
    const block = m[1];
    // match keys like "role:" or "notes :" (ignore ternary, etc.)
    for (const k of block.matchAll(/(\w+)\s*:/g)) keys.add(k[1]);
  }
  return keys;
}

function findPageUsage(src) {
  const keys = new Set();
  for (const m of src.matchAll(/\ba\.(\w+)/g)) keys.add(m[1]);
  return keys;
}

function diff(name, a, b) {
  const onlyA = [...a].filter((k) => !b.has(k));
  const onlyB = [...b].filter((k) => !a.has(k));
  return { name, onlyA, onlyB };
}

const schema = read(prismaPath);
const router = read(routerPath);
const page   = read(pagePath);

if (!schema) console.log('! missing prisma/schema.prisma');
if (!router) console.log('! missing', routerPath);
if (!page)   console.log('! missing', pagePath);

const schemaFields = parseApplicationFields(schema);
const routerKeys   = findRouterDataKeys(router);
const pageKeys     = findPageUsage(page);

const diffs = [
  diff('Router writes vs Schema fields', routerKeys, schemaFields),
  diff('Page reads vs Schema fields', pageKeys, schemaFields),
];

console.log('# Application shape check');
console.log('Schema fields:', [...schemaFields].sort().join(', ') || '(none)');
console.log('Router data keys:', [...routerKeys].sort().join(', ') || '(none)');
console.log('Page field reads:', [...pageKeys].sort().join(', ') || '(none)');
console.log('');

for (const d of diffs) {
  if (d.onlyA.length === 0 && d.onlyB.length === 0) {
    console.log(`✓ ${d.name}: OK`);
  } else {
    if (d.onlyA.length) console.log(`✗ ${d.name}: only in A → ${d.onlyA.join(', ')}`);
    if (d.onlyB.length) console.log(`✗ ${d.name}: only in B → ${d.onlyB.join(', ')}`);
  }
}
