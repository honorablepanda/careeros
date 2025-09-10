import { router } from '../../trpc/trpc';
import { DemoRouter } from '../demo';

describe('demo.ping', () => {
  it('returns ok true', async () => {
    const r = router({ demo: DemoRouter });
    const caller = r.createCaller({} as any);
    const res = await caller.demo.ping();
    expect(res.ok).toBe(true);
  });
});
