# CareerOS

Full-stack freelance platform monorepo built with [Nx](https://nx.dev), [Next.js](https://nextjs.org/), [NestJS](https://nestjs.com/), [Prisma](https://www.prisma.io/), and `pnpm`.

[![CI](https://github.com/honorablepanda/careeros/actions/workflows/ci.yml/badge.svg)](https://github.com/honorablepanda/careeros/actions)

## 🧱 Tech Stack

- Nx (monorepo manager)
- Next.js 15 App Router (`web`)
- NestJS backend (`api`)
- PostgreSQL + Prisma ORM
- tRPC (starter router)
- Tailwind CSS, ESLint, Jest, Playwright
- GitHub Actions CI

## 🛠️ Getting Started

```bash
pnpm install
pnpm nx serve web
pnpm nx serve api
```

## 📂 Nx Useful Commands

```bash
pnpm nx graph
pnpm nx run-many --target=build --all
pnpm nx affected:dep-graph
```
