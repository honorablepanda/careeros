#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const p=path.join(process.cwd(),'apps','api','jest.config.ts');
if(!fs.existsSync(p)){console.log('[guard-jest-config] apps/api/jest.config.ts not found — skipping.');process.exit(0)}
let s=fs.readFileSync(p,'utf8');
if(!/pathsToModuleNameMapper/.test(s)){
  s="const { pathsToModuleNameMapper } = require('ts-jest');\nconst { compilerOptions } = require('../../tsconfig.base.json');\n"+s;
}
if(!/moduleNameMapper\s*:/.test(s)){
  s=s.replace(/(module\.exports\s*=\s*\{)/,m=>m+"\n  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths||{}, { prefix: '<rootDir>/../../' }),");
}else if(!/pathsToModuleNameMapper\(compilerOptions\.paths/.test(s)){
  s=s.replace(/moduleNameMapper\s*:\s*\{[^}]*\}/,"moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths||{}, { prefix: '<rootDir>/../../' })");
}
if(!/transformIgnorePatterns\s*:/.test(s)){
  s=s.replace(/(module\.exports\s*=\s*\{)/,m=>m+"\n  transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)'],");
}else if(!/@trpc\|tslib/.test(s)){
  s=s.replace(/transformIgnorePatterns\s*:\s*\[[^\]]*\]/,"transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)']");
}
fs.writeFileSync(p,s,'utf8');console.log('[guard-jest-config] OK');
