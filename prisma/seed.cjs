// prisma/seed.cjs
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const userId = 'demo-user';
  await db.application.createMany({
    data: [
      { userId, company: 'Acme',    role: 'SWE',    status: 'APPLIED',   source: 'JOB_BOARD',  notes: 'Applied via board' },
      { userId, company: 'Globex',  role: 'FE Dev', status: 'INTERVIEW', source: 'REFERRAL',   notes: 'Phone screen done' },
      { userId, company: 'Initech', role: 'BE Dev', status: 'OFFER',     source: 'RECRUITER',  notes: 'Offer pending' }
    ],
  });
  console.log('Seed complete.');
}

main().finally(() => db.$disconnect());
