# Contributing (quickstart)

## Prereqs
- Node: 20.x (see `.nvmrc`)
- pnpm installed

## Common commands
- **Dev server (Next):** `pnpm run dev`
- **tRPC E2E (client):** `pnpm run smoke:trpc`
- **tRPC raw HTTP (SuperJSON):** `pnpm run ping:trpc`
- **Repo health & wiring:** `pnpm run scan:final`
- **Typecheck (web):** `pnpm -w exec tsc -p web/tsconfig.json --noEmit`
- **Tests (web):** `pnpm run test:web`
- **Build all:** `pnpm -w build`

## Notes
- If you insert demo data during smoke tests, clean up with:
  `node tools/scripts/cleanup-smoke.cjs --since-hours=6 --apply`
- Stub gate is extended to 2025-11-30; replace stubs gradually and keep CI green.
