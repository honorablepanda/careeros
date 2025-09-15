#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const { exec } = require('child_process');
const path = require('path');

function open(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log('Open this URL manually:', url);
  });
  console.log('→ Opening Activity:', url);
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  try {
    // Try by createdAt if present, otherwise fallback to any record
    let app = null;
    try {
      app = await p.application.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      app = await p.application.findFirst({ select: { id: true } });
    }
    if (!app?.id) {
      console.log('No Application records found.');
      process.exit(1);
    }
    const url = `http://localhost:3000/tracker/${app.id}/activity`;
    open(url);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
