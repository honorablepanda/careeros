describe('metrics router', () => {
  it('exports metricsRouter', async () => {
    const modFile = await import('../metrics');
    expect(modFile.metricsRouter).toBeDefined();
  });
});
