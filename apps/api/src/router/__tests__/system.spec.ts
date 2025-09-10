import { router } from '../../trpc/trpc';
import { systemRouter } from '../system';

describe('system.ping', () => {
  it('returns ok & timestamp', async () => {
    const r = router({ system: systemRouter });
    const caller = r.createCaller({} as any);
    const res = await caller.system.ping();
    expect(res.ok).toBe(true);
    expect(typeof res.ts).toBe('number');
  });
});
