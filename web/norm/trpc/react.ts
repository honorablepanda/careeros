export * from '@/trpc';
export { trpc } from '@/trpc';
// If your client uses a default export, also mirror it:
try {
  const m = require('@/trpc');
  if (m?.default) {
    module.exports = m;
  }
} catch {}
