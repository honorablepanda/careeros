#!/usr/bin/env node
/* eslint-disable no-console */

// This script loads your TRPC tracker router (through ts-node), runs the
// key procedures with a fully mocked ctx.prisma, and logs exactly what
// was called. It fails fast with a non-zero exit if expectations are not met.

const path = require('path');

// --- Load TS on the fly
try {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs' },
  });
} catch (e) {
  console.error('Failed to load ts-node. Install it first: pnpm add -D ts-node');
  process.exit(1);
}

// --- Resolve your tracker router (change if your path differs)
const TRACKER_PATHS = [
  'apps/api/src/trpc/routers/tracker.router.ts',
  'apps/api/src/router/tracker.router.ts', // shim path, just in case
];

let routerMod;
let routerPath;
for (const p of TRACKER_PATHS) {
  const abs = path.resolve(p);
  try {
    routerMod = require(abs);
    routerPath = abs;
    break;
  } catch (_) {}
}
if (!routerMod) {
  console.error('Could not load tracker.router.ts from known locations:', TRACKER_PATHS);
  process.exit(1);
}

const trackerRouter =
  routerMod.trackerRouter || routerMod.default || routerMod.router || routerMod;

if (!trackerRouter) {
  console.error('Tracker router loaded but no export named "trackerRouter" found.');
  process.exit(1);
}

const { z } = require('zod');

// --- Minimal publicProcedure harness: we’ll call the procedures via createCaller
// If your router is built with tRPC v10, it should expose createCaller().
if (typeof trackerRouter.createCaller !== 'function') {
  console.error(
    'trackerRouter.createCaller is not a function. Ensure you are using tRPC v10 and export the router.'
  );
  process.exit(1);
}

// --- Spy helpers
function spy(fnName) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    // For Prisma find/update/create we usually return a sensible value
    // Return shapes that your procedure might expect.
    if (fnName.endsWith('application.create')) {
      return Promise.resolve({ id: 'a1' });
    }
    if (fnName.endsWith('application.update')) {
      return Promise.resolve({ id: 'a1', status: 'INTERVIEW' });
    }
    if (fnName.endsWith('applicationActivity.findMany')) {
      return Promise.resolve([{ id: 'act1', type: 'CREATE', payload: {}, createdAt: new Date() }]);
    }
    return Promise.resolve(null);
  };
  fn.calls = calls;
  return fn;
}

// --- Mock Prisma client with spies we care about
const prisma = {
  application: {
    create: spy('application.create'),
    update: spy('application.update'),
    findUnique: spy('application.findUnique'),
  },
  applicationActivity: {
    create: spy('applicationActivity.create'),
    findMany: spy('applicationActivity.findMany'),
    count: spy('applicationActivity.count'),
    findFirst: spy('applicationActivity.findFirst'),
  },
};

// --- Fake ctx the router expects
const ctx = { prisma };

// --- Utilities
function ok(msg) { console.log('✓', msg); }
function fail(msg, extra) {
  console.error('✗', msg);
  if (extra) console.error('   ->', extra);
  process.exitCode = 1;
}

// --- Run the actual procedures if present
(async () => {
  console.log('▶ runtime-activity-check');
  console.log('router:', routerPath);

  const caller = trackerRouter.createCaller(ctx);

  // 1) getApplicationActivity({ id: 'a1' })
  if (typeof caller.getApplicationActivity === 'function') {
    prisma.applicationActivity.findMany.calls.length = 0;
    try {
      await caller.getApplicationActivity({ id: 'a1' });
      const calls = prisma.applicationActivity.findMany.calls;
      if (calls.length === 0) {
        fail('getApplicationActivity did not call prisma.applicationActivity.findMany');
      } else {
        const [firstArg] = calls[0];
        console.log('• getApplicationActivity.findMany arg:', JSON.stringify(firstArg, null, 2));
        const hasDesc =
          firstArg &&
          firstArg.orderBy &&
          firstArg.orderBy.createdAt === 'desc' &&
          firstArg.where &&
          firstArg.where.applicationId === 'a1';
        if (hasDesc) ok('getApplicationActivity → findMany ordered by createdAt desc with correct where');
        else fail('getApplicationActivity → findMany shape is incorrect', firstArg);
      }
    } catch (e) {
      fail('getApplicationActivity threw an error', e?.message || e);
    }
  } else {
    fail('Procedure getApplicationActivity is missing on trackerRouter.createCaller(ctx)');
  }

  // 2) createApplication(input)
  if (typeof caller.createApplication === 'function') {
    prisma.application.create.calls.length = 0;
    prisma.applicationActivity.create.calls.length = 0;
    try {
      const createInput = { userId: 'u1', company: 'Acme', role: 'FE' };
      await caller.createApplication(createInput);
      const appCalls = prisma.application.create.calls;
      const actCalls = prisma.applicationActivity.create.calls;

      if (appCalls.length === 0) fail('createApplication did not call prisma.application.create');
      else ok('createApplication → prisma.application.create called');

      if (actCalls.length === 0) {
        fail('createApplication did not call prisma.applicationActivity.create');
      } else {
        const [firstArg] = actCalls[0];
        console.log('• createApplication.activity.create arg:', JSON.stringify(firstArg, null, 2));
        const okShape =
          firstArg &&
          firstArg.data &&
          firstArg.data.applicationId === 'a1' &&
          firstArg.data.type === 'CREATE' &&
          firstArg.data.payload &&
          JSON.stringify(firstArg.data.payload) === JSON.stringify({ data: createInput });
        if (okShape) ok('createApplication → writes activity { type: "CREATE", payload: { data: <input> } }');
        else fail('createApplication → activity shape is incorrect', firstArg);
      }
    } catch (e) {
      fail('createApplication threw an error', e?.message || e);
    }
  } else {
    fail('Procedure createApplication is missing on trackerRouter.createCaller(ctx)');
  }

  // 3) updateApplication({ id, data })
  if (typeof caller.updateApplication === 'function') {
    prisma.application.update.calls.length = 0;
    prisma.applicationActivity.create.calls.length = 0;
    try {
      const updateInput = { id: 'a1', data: { status: 'INTERVIEW' } };
      await caller.updateApplication(updateInput);
      const updCalls = prisma.application.update.calls;
      const actCalls = prisma.applicationActivity.create.calls;

      if (updCalls.length === 0) fail('updateApplication did not call prisma.application.update');
      else ok('updateApplication → prisma.application.update called');

      if (actCalls.length === 0) {
        fail('updateApplication did not call prisma.applicationActivity.create');
      } else {
        const [firstArg] = actCalls[0];
        console.log('• updateApplication.activity.create arg:', JSON.stringify(firstArg, null, 2));
        const okShape =
          firstArg &&
          firstArg.data &&
          firstArg.data.applicationId === 'a1' &&
          firstArg.data.type === 'STATUS_CHANGE' &&
          firstArg.data.payload &&
          JSON.stringify(firstArg.data.payload) === JSON.stringify({ to: 'INTERVIEW' });
        if (okShape) ok('updateApplication → writes activity { type: "STATUS_CHANGE", payload: { to: <status> } }');
        else fail('updateApplication → activity shape is incorrect', firstArg);
      }
    } catch (e) {
      fail('updateApplication threw an error', e?.message || e);
    }
  } else {
    fail('Procedure updateApplication is missing on trackerRouter.createCaller(ctx)');
  }

  // Final exit code
  process.exit(process.exitCode || 0);
})();
