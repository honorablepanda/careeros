#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'apps', 'web');
const NEXT_DIR = path.join(WEB, '.next');
const NX_CACHE = path.join(ROOT, '.nx', 'cache');

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function pickPort(start = 3000, tries = 10) {
  for (let p = start; p < start + tries; p++) {
    // eslint-disable-next-line no-await-in-loop
    if (await portFree(p)) return p;
  }
  throw new Error(`No free port found from ${start}..${start + tries - 1}`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    ok: res.status === 0,
    code: res.status ?? 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function printAttempt(title, cmd, args) {
  console.log(`\n— ${title} —`);
  console.log(`$ ${cmd} ${args.join(' ')}`);
}

function printLogs(res) {
  const out = (res.stdout || '').trim();
  const err = (res.stderr || '').trim();
  if (out) console.log(out);
  if (err) console.error(err);
}

function seedIdOrWarn() {
  try {
    const out = spawnSync(
      'node',
      [path.join('tools', 'scripts', 'seed-activity.cjs')],
      {
        encoding: 'utf8',
      }
    );
    if (out.status !== 0) {
      console.warn(
        '! Seeding failed. You can still run the server, but dynamic route needs a real id.'
      );
      if (out.stderr) console.warn(out.stderr.trim());
      return '';
    }
    const id = (out.stdout || '').trim();
    if (!id) {
      console.warn(
        '! Seed script returned empty id. Dynamic route will need a real id.'
      );
    }
    return id;
  } catch (e) {
    console.warn('! Seed step crashed:', e.message);
    return '';
  }
}

(async () => {
  console.log('→ Clearing Next & Nx cache …');
  rmrf(NEXT_DIR);
  rmrf(NX_CACHE);

  // Try both build styles with verbose flags; print logs on failure
  const env = { ...process.env, NX_DAEMON: 'false', CI: '1' };
  const attempts = [
    {
      title: 'Nx build (run-style)',
      cmd: 'pnpm',
      args: [
        '-w',
        'exec',
        'nx',
        'run',
        'web:build',
        '--skip-nx-cache',
        '--verbose',
      ],
    },
    {
      title: 'Nx build (target-style)',
      cmd: 'pnpm',
      args: [
        '-w',
        'exec',
        'nx',
        'build',
        'web',
        '--skip-nx-cache',
        '--verbose',
      ],
    },
  ];

  let built = false;
  for (const a of attempts) {
    printAttempt(a.title, a.cmd, a.args);
    const res = run(a.cmd, a.args, { env });
    printLogs(res);
    if (res.ok) {
      built = true;
      break;
    }
    console.error(`✗ Build attempt failed (${a.title}).`);
  }

  if (!built) {
    console.error('\nBuild failed in all attempts. Common fixes:');
    console.error(
      '  • Check the actual error above (TS errors, missing imports, etc.)'
    );
    console.error('  • Try: pnpm -w exec nx show project web');
    console.error(
      '  • Ensure the "build" target exists for project "web" in project.json/workspace.json'
    );
    process.exit(1);
  }

  console.log('\n✓ Build succeeded.');

  console.log('→ Seeding a demo Application …');
  const id = seedIdOrWarn();
  if (id) console.log(`✓ Seeded Application id: ${id}`);

  const port = await pickPort(3000);
  const urlDyn = id ? `http://localhost:${port}/tracker/${id}/activity` : null;
  const urlQuery = id
    ? `http://localhost:${port}/tracker/activity?id=${id}`
    : null;

  console.log(`\n→ Starting dev server on port ${port} …`);
  // Use Nx "serve" target; Next respects PORT env
  const child = spawn('pnpm', ['-w', 'exec', 'nx', 'run', 'web:serve'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port), NX_DAEMON: 'false' },
  });

  child.on('exit', (code) => {
    console.log(`Dev server exited with code ${code}`);
  });

  console.log('\n=== Open these in your browser ===');
  console.log(`Home:            http://localhost:${port}/`);
  if (id) {
    console.log(`Dynamic route:   ${urlDyn}`);
    console.log(`Querystring alt: ${urlQuery}`);
  } else {
    console.log(
      'No APP_ID available — run: node tools/scripts/seed-activity.cjs and use its output in the URL.'
    );
  }
})();
