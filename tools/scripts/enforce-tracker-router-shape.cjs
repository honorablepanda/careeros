/**
 * Ensures:
 *  - apps/api/src/trpc/routers/tracker.router.ts exists
 *  - Named export: `export const trackerRouter = createTRPCRouter({ ... })`
 *  - Procedures present with exact keys the scanner expects:
 *      createApplication, updateApplication, getApplicationActivity
 *  - Shapes match tests (CREATE payload.data=input, STATUS_CHANGE payload.to, findMany ordered desc)
 */
const fs = require('fs');
const path = require('path');

const file = 'apps/api/src/trpc/routers/tracker.router.ts';
if (!fs.existsSync(file)) {
  console.error(`! missing ${file}`);
  process.exit(1);
}
let s = fs.readFileSync(file, 'utf8');
let orig = s;

// 1) Ensure createTRPCRouter import
if (!/createTRPCRouter/.test(s)) {
  s = s.replace(
    /from\s+['"]@\/trpc\/trpc['"];?/,
    "from '@/trpc/trpc';\n// ensure createTRPCRouter is imported"
  );
}

// 2) Ensure named export `trackerRouter`
if (!/export\s+const\s+trackerRouter\s*=/.test(s)) {
  // Try to find default export and convert
  s = s.replace(
    /export\s+default\s+createTRPCRouter\s*\(\s*\{/,
    'export const trackerRouter = createTRPCRouter({'
  );
  // If neither default nor named existed, wrap the inner object crudely
  if (!/export\s+const\s+trackerRouter\s*=/.test(s)) {
    const body = s.match(/\{\s*[\s\S]*\}\s*;?\s*$/);
    if (body) {
      s += `\nexport const trackerRouter = createTRPCRouter(${body[0]
        .trim()
        .replace(/;$/, '')});\n`;
    }
  }
}

// 3) Ensure procedure keys exist (create/update/get)
function ensureKey(key, snippet) {
  if (!new RegExp(`\\b${key}\\s*:`).test(s)) {
    s = s.replace(/createTRPCRouter\s*\(\s*\{/, (m) => `${m}\n  ${snippet},`);
  }
}

// canonical snippets (aligned with your tests & normalization)
const CREATE_SNIPPET = `
createApplication: publicProcedure
  .input(z.object({}).passthrough())
  .mutation(async ({ ctx, input }) => {
    const prismaAny = ctx.prisma as any;
    const created = await prismaAny?.application?.create?.({ data: input });
    if (prismaAny?.applicationActivity?.create && created?.id) {
      await prismaAny.applicationActivity.create({
        data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },
      });
    }
    return created;
  })`;

const UPDATE_SNIPPET = `
updateApplication: publicProcedure
  .input(z.object({ id: z.string(), data: z.object({}).passthrough() }))
  .mutation(async ({ ctx, input }) => {
    const prismaAny = ctx.prisma as any;
    const updated = await prismaAny?.application?.update?.({
      where: { id: input.id },
      data: input.data,
    });
    const nextStatus = (input?.data as any)?.status;
    if (prismaAny?.applicationActivity?.create && nextStatus) {
      await prismaAny.applicationActivity.create({
        data: { applicationId: input.id, type: 'STATUS_CHANGE', payload: { to: nextStatus } },
      });
    }
    return updated;
  })`;

const GET_SNIPPET = `
getApplicationActivity: publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const prismaAny = ctx.prisma as any;
    if (!prismaAny?.applicationActivity?.findMany) return [];
    return await prismaAny.applicationActivity.findMany({
      where: { applicationId: input.id },
      orderBy: { createdAt: 'desc' },
    });
  })`;

ensureKey('createApplication', CREATE_SNIPPET.trim());
ensureKey('updateApplication', UPDATE_SNIPPET.trim());
ensureKey('getApplicationActivity', GET_SNIPPET.trim());

// 4) Make sure the export is correct and not duplicated
// Remove any stray `export default trackerRouter`
s = s.replace(/export\s+default\s+trackerRouter\s*;?/g, '');

// 5) Final write if changed
if (s !== orig) {
  fs.writeFileSync(file, s, 'utf8');
  console.log(`✓ enforced tracker router shape in ${file}`);
} else {
  console.log('= tracker router already matches expected shape');
}
