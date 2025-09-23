#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const hoursArg = args.find((a) => a.startsWith('--since-hours='));
const SINCE_HOURS = Number((hoursArg || '').split('=')[1] || 48);
const since = new Date(Date.now() - SINCE_HOURS * 60 * 60 * 1000);

// Narrow this to the smoke data pattern you saw being inserted:
const where = {
  userId: 'demo-user',
  company: { in: ['ACME', 'Acme'] },
  createdAt: { gte: since },
};

(async () => {
  const toDelete = await prisma.application.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      company: true,
      role: true,
      status: true,
      source: true,
      createdAt: true,
    },
  });

  if (!toDelete.length) {
    console.log(`No matches in the last ${SINCE_HOURS}h.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Would delete ${toDelete.length} rows:\n`);
  console.table(
    toDelete.map((a) => ({
      id: a.id,
      company: a.company,
      role: a.role,
      status: a.status,
      source: a.source,
      createdAt: a.createdAt,
    }))
  );

  if (!APPLY) {
    console.log(
      `\nDry run only. Re-run with --apply to delete. (You can adjust --since-hours=N)`
    );
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.application.deleteMany({ where });
  console.log(`\nDeleted ${res.count} rows.`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
