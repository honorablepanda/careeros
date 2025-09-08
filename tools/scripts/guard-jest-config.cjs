#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const R=process.cwd();

// Find api/jest.config.ts (api/ or apps/api/)
function findApiJest(){
  const a=path.join(R,'api','jest.config.ts');
  const b=path.join(R,'apps','api','jest.config.ts');
  return fs.existsSync(a)?a:(fs.existsSync(b)?b:null);
}
const p=findApiJest();
if(!p){ console.log('[guard-jest-config] api jest.config.ts not found — skipping.'); process.exit(0); }

let s=fs.readFileSync(p,'utf8');

// Compute correct prefix to repo root
const configDir=path.dirname(p);
let relToRoot=path.relative(configDir, R).replace(/\\/g,'/');
if (relToRoot.length && !relToRoot.endsWith('/')) relToRoot += '/';
const prefix = `<rootDir>/${relToRoot}`;

// Ensure ts-jest header with the RIGHT path to tsconfig.base.json
const headerRe = /const\s*\{\s*compilerOptions\s*\}\s*=\s*require\(['"].*?tsconfig\.base\.json['"]\);\s*/;
const header = `const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('${relToRoot}tsconfig.base.json');
`;
if (/pathsToModuleNameMapper/.test(s)) {
  // Replace existing compilerOptions line if needed
  if (headerRe.test(s)) s = s.replace(headerRe, `const { compilerOptions } = require('${relToRoot}tsconfig.base.json');\n`);
} else {
  s = header + s;
}

// moduleNameMapper → dynamic prefix
if(!/moduleNameMapper\s*:/.test(s)){
  s = s.replace(/(module\.exports\s*=\s*\{)/, m => m + `\n  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths||{}, { prefix: '${prefix}' }),`);
} else if(!/pathsToModuleNameMapper\(compilerOptions\.paths/.test(s)){
  s = s.replace(/moduleNameMapper\s*:\s*\{[^}]*\}/, `moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths||{}, { prefix: '${prefix}' })`);
}

// transformIgnorePatterns for @trpc + tslib
if(!/transformIgnorePatterns\s*:/.test(s)){
  s = s.replace(/(module\.exports\s*=\s*\{)/, m => m + `\n  transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)'],`);
} else if(!/@trpc\|tslib/.test(s)){
  s = s.replace(/transformIgnorePatterns\s*:\s*\[[^\]]*\]/, `transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)']`);
}

fs.writeFileSync(p, s, 'utf8');
console.log('[guard-jest-config] OK →', path.relative(R,p), 'prefix=', prefix);
