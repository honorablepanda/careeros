// apps/api/src/router/__tests__/tracker.spec.ts
describe('tracker router', () => {
  it('has a trackerRouter symbol', async () => {
    const mod = await import('../tracker');
    expect(mod.trackerRouter).toBeDefined();
  });
});
