const fs = require("fs");
const path = "web/src/app/layout.tsx";

if (!fs.existsSync(path)) {
  console.error("! layout not found:", path);
  process.exit(0);
}
let s = fs.readFileSync(path, "utf8");
if (/suppressHydrationWarning/.test(s)) {
  console.log("= suppressHydrationWarning already present");
  process.exit(0);
}

// Try to inject into the opening <body ...> tag before className=
s = s.replace(
  /<body(.*?)className="/,
  '<body suppressHydrationWarning$1className="'
);

if (!/suppressHydrationWarning/.test(s)) {
  console.error("! Could not add suppressHydrationWarning automatically. Please edit manually.");
  process.exit(1);
}

fs.writeFileSync(path, s, "utf8");
console.log("✓ Added suppressHydrationWarning to <body> in", path);
