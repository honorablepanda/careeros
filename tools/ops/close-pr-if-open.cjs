const { execSync } = require("node:child_process");
const pr = process.argv[2];
if (!pr) { console.error("Usage: pnpm run ops:close-pr -- <PR_NUMBER>"); process.exit(1); }
function sh(cmd) { return execSync(cmd, { stdio: ["ignore","pipe","ignore"] }).toString().trim(); }
try {
  const state = sh(`gh pr view ${pr} --json state --jq .state`);
  if (state === "OPEN") {
    execSync(`gh pr close ${pr} --delete-branch --comment "Closed: merged or superseded on main."`, { stdio: "inherit" });
  } else {
    console.log(`PR #${pr} is not OPEN (state=${state}); nothing to do.`);
  }
} catch {
  console.log(`PR #${pr} not found or gh not authed; skipping.`);
}