#!/usr/bin/env python3
import os
from pathlib import Path
import csv

# 🧩 Phase 3 modules (adjust as you like)
MODULES = [
    "auth","onboarding","dashboard","tracker","resume","settings","profile","goals",
    "planner","calendar","roadmap","interviews","activity","notifications","summary",
    "skills","insights","metrics","achievements","networking",
]

# 📁 repo root (…/tools/scripts/ -> go 2 levels up)
PROJECT_ROOT = Path(__file__).resolve().parents[2]

def exists(p: Path) -> bool:
    try: return p.exists()
    except: return False

def exists_any(paths) -> bool:
    return any(exists(p) for p in paths)

def contains_text(p: Path, term: str) -> bool:
    try:
        return p.exists() and term in p.read_text(encoding="utf-8", errors="ignore")
    except:
        return False

def first_existing(paths):
    for p in paths:
        if exists(p): return p
    return None

def check_module(m: str):
    # --- Router file candidates (support both old/new layouts)
    router_paths = [
        PROJECT_ROOT / f"apps/api/src/router/{m}.ts",
        PROJECT_ROOT / f"apps/api/src/router/{m}.router.ts",
        PROJECT_ROOT / f"apps/api/src/trpc/routers/{m}.router.ts",
        PROJECT_ROOT / f"apps/api/src/trpc/{m}.router.ts",
    ]

    # --- Router unit tests
    router_test_paths = [
        PROJECT_ROOT / f"apps/api/src/router/__tests__/{m}.spec.ts",
        PROJECT_ROOT / f"apps/api/src/trpc/__tests__/{m}.router.spec.ts",
        PROJECT_ROOT / f"apps/api/src/router/__tests__/{m}.router.spec.ts",
    ]

    # --- Web page (apps/web vs web)
    page_paths = [
        PROJECT_ROOT / f"web/src/app/{m}/page.tsx",
        PROJECT_ROOT / f"apps/web/src/app/{m}/page.tsx",
    ]

    # --- E2E tests (various common layouts)
    e2e_paths = [
        PROJECT_ROOT / f"web-e2e/src/{m}.e2e.spec.ts",
        PROJECT_ROOT / f"apps/web-e2e/src/{m}.e2e.spec.ts",
        PROJECT_ROOT / f"apps/web/src/specs/{m}.e2e.spec.ts",
        PROJECT_ROOT / f"web/specs/{m}.e2e.spec.ts",
        PROJECT_ROOT / f"web/specs/{m}.e2e.spec.tsx",
    ]

    # --- Types (libs/types vs shared/types, with/without src)
    types_file_paths = [
        PROJECT_ROOT / f"libs/types/{m}.ts",
        PROJECT_ROOT / f"libs/types/src/{m}.ts",
        PROJECT_ROOT / f"shared/types/{m}.ts",
        PROJECT_ROOT / f"shared/types/src/{m}.ts",
    ]
    types_index_paths = [
        PROJECT_ROOT / "libs/types/index.ts",
        PROJECT_ROOT / "libs/types/src/index.ts",
        PROJECT_ROOT / "shared/types/index.ts",
        PROJECT_ROOT / "shared/types/src/index.ts",
    ]

    # --- appRouter registration (root or trpc)
    app_router_files = [
        PROJECT_ROOT / "apps/api/src/router/root.ts",
        PROJECT_ROOT / "apps/api/src/trpc/root.ts",
        PROJECT_ROOT / "apps/api/src/trpc/app.router.ts",
        PROJECT_ROOT / "apps/api/src/router/app.router.ts",
    ]
    app_router_file = first_existing(app_router_files)
    registered = contains_text(app_router_file, m) if app_router_file else False

    return {
        "Module": m,
        "Router": exists_any(router_paths),
        "Unit Test": exists_any(router_test_paths),
        "E2E Test": exists_any(e2e_paths),
        "Page": exists_any(page_paths),
        "Types": exists_any(types_file_paths),
        "Types Exported": any(contains_text(p, m) for p in types_index_paths),
        "Registered in appRouter": registered,
    }

def main():
    out_dir = PROJECT_ROOT / "tools" / "module-scan-output"
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "phase3_module_status.csv"
    md_path = out_dir / "phase3_module_status.md"

    rows = [check_module(m) for m in MODULES]

    # CSV
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    # Markdown
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("| Module | Router | Unit Test | E2E Test | Page | Types | Types Exported | Registered in appRouter |\n")
        f.write("|--------|--------|-----------|----------|------|-------|----------------|--------------------------|\n")
        for r in rows:
            f.write(
                f"| {r['Module']} | {'✅' if r['Router'] else '❌'}"
                f" | {'✅' if r['Unit Test'] else '❌'}"
                f" | {'✅' if r['E2E Test'] else '❌'}"
                f" | {'✅' if r['Page'] else '❌'}"
                f" | {'✅' if r['Types'] else '❌'}"
                f" | {'✅' if r['Types Exported'] else '❌'}"
                f" | {'✅' if r['Registered in appRouter'] else '❌'} |\n"
            )

    print("✅ Module scan complete.")
    print(f"📄 CSV: {csv_path}")
    print(f"📄 Markdown: {md_path}")

if __name__ == "__main__":
    main()
