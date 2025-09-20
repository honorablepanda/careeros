#!/usr/bin/env node
/* tools/scripts/seed-and-verify-activity.cjs */
const { PrismaClient } = require('@prisma/client');

function getArg(flag, def = undefined) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : def;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const HOST = getArg('--host', 'http://localhost');
const PORT = Number(getArg('--port', '3000'));
const APP_ID = getArg('--id', null);
const STRICT = hasFlag('--strict');
const OUT = getArg('--out', null); // if set, also write JSON to file
const prisma = new PrismaClient();

const log = (...a) => console.error(...a);
const ok = (m) => log(`✓ ${m}`);
const warn = (m) => log(`! ${m}`);
const err = (m) => log(`✗ ${m}`);

async function pickApplicationId() {
  if (APP_ID) return APP_ID;

  // Try most recent by updatedAt/createdAt; fall back to any.
  const select = { id: true, userId: true, company: true, role: true, status: true };
  const tryOrders = [
    { updatedAt: 'desc' },
    { createdAt: 'desc' },
  ];

  for (const orderBy of tryOrders) {
    try {
      const a = await prisma.application.findFirst({ select, orderBy });
      if (a?.id) return a.id;
    } catch {}
  }
  const a = await prisma.application.findFirst({ select });
  return a?.id || null;
}

async function seedActivity(appId) {
  // Get the application to mirror into payload.data
  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, userId: true, company: true, title: true, status: true  },
  });
  if (!app) throw new Error(`Application not found: ${appId}`);

  const existing = await prisma.applicationActivity.findMany({ where: { applicationId: appId }, orderBy: { createdAt: 'desc' },
    select: { id: true, type: true  },
    orderBy: { createdAt: 'desc' },
  });

  const hasCreate = existing.some((e) => e.type === 'CREATE');
  const creates = [];

  if (!hasCreate) {
    creates.push(
      prisma.applicationActivity.create({
        data: {
          applicationId: appId,
          type: 'CREATE',
          payload: { data: app },
        },
      })
    );
  }

  // Always add a STATUS_CHANGE (safe even if redundant)
  creates.push(
    prisma.applicationActivity.create({
      data: {
        applicationId: appId,
        type: 'STATUS_CHANGE',
        payload: { to: app.status || 'APPLIED' },
      },
    })
  );

  const results = await Promise.allSettled(creates);
  const created = results.filter((r) => r.status === 'fulfilled').length;

  const after = await prisma.applicationActivity.count({ where: { applicationId: appId } });
  const byType = await prisma.applicationActivity.groupBy({
    by: ['type'],
    where: { applicationId: appId },
    _count: { _all: true },
  }).catch(() => []);

  return {
    beforeCount: existing.length,
    created,
    afterCount: after,
    byType: Object.fromEntries(byType.map((x) => [x.type, x._count._all])),
  };
}

async function fetchRoute(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const text = await res.text();
    const snippet = text.replace(/\s+/g, ' ').slice(0, 200);
    return { ok: res.ok, status: res.status, snippet };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

async function main() {
  const report = {
    params: { host: HOST, port: PORT, strict: STRICT },
    steps: [],
    results: {},
    ok: false,
  };

  try {
    const appId = await pickApplicationId();
    if (!appId) {
      err('No Application found. Create one first or pass --id <ID>.');
      report.steps.push('No application id available');
      return finish(report, 1);
    }
    ok(`Using Application id: ${appId}`);
    report.appId = appId;

    // Seed activity
    const seeded = await seedActivity(appId);
    (seeded.afterCount > seeded.beforeCount)
      ? ok(`Seeded activity rows (+${seeded.afterCount - seeded.beforeCount})`)
      : warn('No new rows inserted (some may already exist)');
    report.results.seed = seeded;

    // DB truth check
    const activityCount = await prisma.applicationActivity.count({ where: { applicationId: appId } });
    report.results.db = { activityCount };

    if (STRICT && activityCount === 0) {
      err('Strict mode: still zero activity rows');
      report.ok = false;
      return finish(report, 2);
    }

    // Web checks
    const base = `${HOST}:${PORT}`;
    const urlQuery = `${base}/tracker/activity?id=${encodeURIComponent(appId)}`;
    const urlDynamic = `${base}/tracker/${encodeURIComponent(appId)}/activity`;

    const [q, d] = await Promise.all([fetchRoute(urlQuery), fetchRoute(urlDynamic)]);
    report.results.web = {
      query: { url: urlQuery, ...q },
      dynamic: { url: urlDynamic, ...d },
    };

    if (!q.ok || !d.ok) {
      if (!q.ok) err(`Query route failed (status ${q.status})`);
      if (!d.ok) err(`Dynamic route failed (status ${d.status})`);
      report.ok = false;
      return finish(report, 3);
    }

    ok(`Query route 200 • ${urlQuery}`);
    ok(`Dynamic route 200 • ${urlDynamic}`);

    // Final decision
    report.ok = true;
    return finish(report, 0);
  } catch (e) {
    err(String(e?.message || e));
    report.error = String(e?.message || e);
    report.ok = false;
    return finish(report, 10);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  async function finish(rep, code) {
    const json = JSON.stringify(rep, null, 2);
    if (OUT) {
      const fs = require('fs');
      require('fs').writeFileSync(OUT, json);
      log(`→ Wrote ${OUT}`);
    }
    process.stdout.write(json + '\n');
    process.exit(code);
  }
}

main();
