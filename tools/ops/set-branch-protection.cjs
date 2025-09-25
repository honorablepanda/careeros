const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

const mode   = (process.argv[2] || "").toLowerCase();   // "on" | "off"
const branch = process.argv[3] || "main";
const checks = process.argv.slice(4);                   // optional list of required status checks

if (!["on","off"].includes(mode)) {
  console.error("Usage:");
  console.error("  pnpm run ops:protect:off");
  console.error('  pnpm run ops:protect:on   # defaults to require "CI / build_test"');
  console.error('  node tools/ops/set-branch-protection.cjs on main "<CHECK_1>" "<CHECK_2>"');
  process.exit(1);
}

let repo = "";
try {
  repo = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', { stdio: ["ignore","pipe","ignore"] })
           .toString().trim();
} catch {
  console.error("`gh` not authenticated or repo not found. Run: gh auth status");
  process.exit(1);
}

if (mode === "off") {
  execSync(`gh api -X DELETE repos/${repo}/branches/${branch}/protection`, { stdio: "inherit" });
  console.log(`✓ Protection removed from ${branch}`);
  process.exit(0);
}

const requiredChecks = checks.length ? checks : ["CI / build_test"];
const payload = {
  required_status_checks: { strict: false, contexts: requiredChecks },
  enforce_admins: true,
  required_pull_request_reviews: { required_approving_review_count: 1 },
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false
};

const tmp = path.join(os.tmpdir(), `bp-${Date.now()}.json`);
fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
try {
  execSync(`gh api -X PUT repos/${repo}/branches/${branch}/protection --input "${tmp}"`, { stdio: "inherit" });
  console.log(`✓ Protection enabled on ${branch} (required checks: ${requiredChecks.join(", ")})`);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}