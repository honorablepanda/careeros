describe('insights router', () => {
  it('exports insightsRouter', async () => {
    const modFile = await import('../insights');
    expect(modFile.insightsRouter).toBeDefined();
  });
});
