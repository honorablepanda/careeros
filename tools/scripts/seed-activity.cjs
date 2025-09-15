#!/usr/bin/env node
/* tools/scripts/seed-activity.cjs */
const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

async function main() {
  const userId = 'dev-user';
  const company = 'Acme Inc';
  const role = 'Engineer';
  const status = 'APPLIED';

  // Find or create an application
  const existing = await p.application.findFirst({
    where: { userId, company, role },
    select: { id: true },
  });

  const app =
    existing ??
    (await p.application.create({
      data: { userId, company, role, status },
      select: { id: true },
    }));

  // Ensure at least one activity row exists
  const hasAnyActivity = await p.applicationActivity.findFirst({
    where: { applicationId: app.id },
    select: { id: true },
  });

  if (!hasAnyActivity) {
    await p.applicationActivity.create({
      data: {
        applicationId: app.id,
        type: 'CREATE',
        payload: { data: { userId, company, role, status } },
      },
    });
    await p.applicationActivity.create({
      data: {
        applicationId: app.id,
        type: 'STATUS_CHANGE',
        payload: { to: 'INTERVIEW' },
      },
    });
  }

  console.log(app.id);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
