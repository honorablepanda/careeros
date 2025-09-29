#!/usr/bin/env node
const { execSync } = require("child_process");

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] }).toString("utf8");
}

const files = sh("git ls-files -z").split("\0").filter(Boolean);
const schemas = files.filter(f => /\/prisma\/schema\.prisma$/.test(f));

if (schemas.length === 0) {
  console.log("No Prisma schemas found");
  process.exit(0);
}

for (const s of schemas) {
  console.log(`Generating for ${s}`);
  execSync(`pnpm -w exec prisma generate --schema="${s}"`, { stdio: "inherit" });
}
